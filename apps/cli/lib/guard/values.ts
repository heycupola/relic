import type { ProtectedApi } from "../api";
import type { DecryptedSecret } from "../crypto";
import { buildSecretPatterns, type SecretPatterns } from "./patterns";

export const DEFAULT_VALUES_TIMEOUT_MS = 20_000;

export type ValuesResult =
  | { status: "loaded"; environments: string[]; patterns: SecretPatterns; warnings: string[] }
  | { status: "skipped"; reason: string }
  | { status: "disabled" };

export class GuardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardConfigError";
  }
}

type GuardApi = Pick<
  ProtectedApi,
  "getFullUser" | "getProject" | "getProjectShare" | "getProjectEnvironments" | "getEnvironmentData"
>;

export interface ValuesDeps {
  env: Record<string, string | undefined>;
  validateSession: () => Promise<{ isValid: boolean; isExpired?: boolean }>;
  getPassword: () => Promise<string | null>;
  getApi: () => Promise<GuardApi>;
  getProjectKey: (
    encryptedProjectKey: string,
    encryptedPrivateKey: string,
    salt: string,
  ) => Promise<CryptoKey>;
  decryptSecrets: (
    projectKey: CryptoKey,
    secrets: Array<{ key: string; encryptedValue: string }>,
  ) => Promise<DecryptedSecret[]>;
  exportWithServiceToken: (environment: string) => Promise<Record<string, string>>;
  exportWithApiKey: (projectId: string, environment: string) => Promise<Record<string, string>>;
}

function isNoSecretsError(err: unknown): boolean {
  return err instanceof Error && err.message === "No secrets found";
}

const defaultDeps: ValuesDeps = {
  env: process.env,
  validateSession: async () => (await import("@repo/auth")).validateSession(),
  getPassword: async () => (await import("@repo/auth")).getPasswordFromStorage(),
  getApi: async () => (await import("../api")).getApi(),
  getProjectKey: async (...args) => (await import("../crypto")).getProjectKey(...args),
  decryptSecrets: async (...args) => (await import("../crypto")).decryptSecrets(...args),
  exportWithServiceToken: async (environment) => {
    const { prepareSecretsWithServiceToken } = await import("../../commands/run");
    try {
      return (await prepareSecretsWithServiceToken({ environment })).secrets;
    } catch (err) {
      if (isNoSecretsError(err)) return {};
      throw err;
    }
  },
  exportWithApiKey: async (projectId, environment) => {
    const { prepareSecretsWithApiKey } = await import("../../commands/run");
    try {
      return (await prepareSecretsWithApiKey(projectId, { environment })).secrets;
    } catch (err) {
      if (isNoSecretsError(err)) return {};
      throw err;
    }
  },
};

export interface LoadValuesOptions {
  projectId: string | null;
  environments: string[];
  minLength: number;
  timeoutMs?: number;
}

interface DecryptedEntry {
  key: string;
  value: string;
  environment: string;
}

function loaded(
  entries: DecryptedEntry[],
  environments: string[],
  minLength: number,
  warnings: string[] = [],
): ValuesResult {
  return {
    status: "loaded",
    environments,
    patterns: buildSecretPatterns(entries, minLength),
    warnings,
  };
}

async function loadWithExporter(
  environments: string[],
  minLength: number,
  exporter: (environment: string) => Promise<Record<string, string>>,
): Promise<ValuesResult> {
  const entries: DecryptedEntry[] = [];
  for (const environment of environments) {
    const secrets = await exporter(environment);
    for (const [key, value] of Object.entries(secrets)) {
      entries.push({ key, value, environment });
    }
  }
  return loaded(entries, environments, minLength);
}

async function resolveEncryptedProjectKey(
  api: GuardApi,
  projectId: string,
  userId: string,
): Promise<string> {
  const project = await api.getProject(projectId);
  if (project.ownerId === userId) return project.encryptedProjectKey;
  const share = await api.getProjectShare(projectId).catch(() => null);
  return share?.encryptedProjectKey ?? project.encryptedProjectKey;
}

async function loadWithSession(
  options: LoadValuesOptions,
  deps: ValuesDeps,
): Promise<ValuesResult> {
  if (!options.projectId) {
    return { status: "skipped", reason: "no linked project (relic.toml not found)" };
  }

  const session = await deps.validateSession();
  if (!session.isValid || session.isExpired) {
    return { status: "skipped", reason: "not logged in (run `relic login`)" };
  }

  if (!(await deps.getPassword())) {
    return { status: "skipped", reason: "no stored password (run `relic` to set it up)" };
  }

  const api = await deps.getApi();
  const available = await api.getProjectEnvironments(options.projectId);

  let selected = available;
  if (options.environments.length > 0) {
    selected = options.environments.map((requested) => {
      const match = available.find((env) => env.name.toLowerCase() === requested.toLowerCase());
      if (!match) {
        throw new GuardConfigError(
          `Environment "${requested}" not found. Available: ${available.map((e) => e.name).join(", ") || "none"}`,
        );
      }
      return match;
    });
  }

  if (selected.length === 0) {
    return loaded([], [], options.minLength);
  }

  const user = await api.getFullUser();
  if (!user.encryptedPrivateKey || !user.salt) {
    return { status: "skipped", reason: "no encryption keys found (run `relic` to set them up)" };
  }

  const encryptedProjectKey = await resolveEncryptedProjectKey(api, options.projectId, user.id);
  const projectKey = await deps.getProjectKey(
    encryptedProjectKey,
    user.encryptedPrivateKey,
    user.salt,
  );

  const entries: DecryptedEntry[] = [];
  const warnings: string[] = [];
  for (const environment of selected) {
    let secrets: { key: string; encryptedValue: string }[];
    try {
      secrets = (await api.getEnvironmentData(environment.id)).secrets;
    } catch {
      warnings.push(`could not read environment "${environment.name}"`);
      continue;
    }
    const decrypted = await deps.decryptSecrets(projectKey, secrets);
    for (const secret of decrypted) {
      entries.push({ key: secret.key, value: secret.value, environment: environment.name });
    }
  }

  return loaded(
    entries,
    selected.map((env) => env.name),
    options.minLength,
    warnings,
  );
}

async function loadValues(options: LoadValuesOptions, deps: ValuesDeps): Promise<ValuesResult> {
  if (deps.env.RELIC_SERVICE_TOKEN) {
    if (options.environments.length === 0) {
      return {
        status: "skipped",
        reason: "service tokens need an explicit environment (pass -e <name>)",
      };
    }
    return loadWithExporter(options.environments, options.minLength, deps.exportWithServiceToken);
  }

  if (deps.env.RELIC_API_KEY) {
    const projectId = options.projectId;
    if (!projectId) {
      return { status: "skipped", reason: "no linked project (relic.toml not found)" };
    }
    if (options.environments.length === 0) {
      return {
        status: "skipped",
        reason: "API keys need an explicit environment (pass -e <name>)",
      };
    }
    return loadWithExporter(options.environments, options.minLength, (environment) =>
      deps.exportWithApiKey(projectId, environment),
    );
  }

  return loadWithSession(options, deps);
}

export async function loadSecretValues(
  options: LoadValuesOptions,
  deps: ValuesDeps = defaultDeps,
): Promise<ValuesResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_VALUES_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<ValuesResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "skipped", reason: `timed out after ${timeoutMs / 1000}s` }),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([loadValues(options, deps), timeout]);
  } catch (err) {
    if (err instanceof GuardConfigError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { status: "skipped", reason: `could not load secrets (${message})` };
  } finally {
    clearTimeout(timer);
  }
}
