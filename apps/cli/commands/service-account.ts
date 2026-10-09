import { getPasswordFromStorage } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import { ConvexError } from "convex/values";
import ora, { type Ora } from "ora";
import pc from "picocolors";
import { getApi, UPGRADE_URL } from "../lib/api";
import {
  failWithUpgradePrompt,
  getErrorMessage,
  hasActiveSession,
  NO_PASSWORD_MESSAGE,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  resolveProjectIdWithConfig,
} from "../lib/cli";

const DAY_MS = 24 * 60 * 60 * 1000;

interface OidcOptions {
  github?: string;
  gitlab?: string;
  branch?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
  oidcAudience?: string;
}

export interface ServiceAccountCreateOptions extends OidcOptions {
  project?: string;
  name: string;
  expiresIn?: string;
}

function parseConvexError(err: unknown): { code?: string; message: string } {
  if (err instanceof ConvexError) {
    let data = err.data;
    while (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        break;
      }
    }
    if (typeof data === "object" && data !== null) {
      const d = data as { code?: string; message?: string };
      return { code: d.code, message: d.message ?? err.message };
    }
  }
  return { message: getErrorMessage(err) };
}

function fail(spinner: Ora, message: string): never {
  spinner.fail(pc.red(message));
  process.exit(1);
}

async function handleError(spinner: Ora, err: unknown): Promise<never> {
  const parsed = parseConvexError(err);
  if (parsed.code === "PRO_PLAN_REQUIRED") {
    await failWithUpgradePrompt(spinner, parsed.message, UPGRADE_URL);
  }
  fail(spinner, parsed.message);
}

async function requireSession(spinner: Ora): Promise<void> {
  if (!(await hasActiveSession())) {
    fail(spinner, NOT_LOGGED_IN_MESSAGE);
  }
}

async function requireProjectId(spinner: Ora, projectOption?: string): Promise<string> {
  const projectId = await resolveProjectIdWithConfig(projectOption);
  if (!projectId) {
    fail(spinner, PROJECT_ID_REQUIRED_MESSAGE);
  }
  return projectId;
}

function resolveOidcArgs(options: OidcOptions): {
  oidcIssuer?: string;
  oidcSubjectPattern?: string;
  oidcAudience?: string;
} {
  if (options.github && options.gitlab) {
    throw new Error("Cannot use both --github and --gitlab.");
  }

  if (options.github) {
    const parts = options.github.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("--github must be in the format org/repo (e.g. myorg/myrepo).");
    }
    const branch = options.branch ?? "*";
    const ref = branch === "*" ? "*" : `ref:refs/heads/${branch}`;
    return {
      oidcIssuer: "https://token.actions.githubusercontent.com",
      oidcSubjectPattern: `repo:${options.github}:${ref}`,
      oidcAudience: options.oidcAudience,
    };
  }

  if (options.gitlab) {
    const parts = options.gitlab.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("--gitlab must be in the format group/project (e.g. mygroup/myproject).");
    }
    const branch = options.branch ?? "*";
    const ref = branch === "*" ? "*" : `ref_type:branch:ref:${branch}`;
    return {
      oidcIssuer: "https://gitlab.com",
      oidcSubjectPattern: `project_path:${options.gitlab}:${ref}`,
      oidcAudience: options.oidcAudience,
    };
  }

  return {
    oidcIssuer: options.oidcIssuer,
    oidcSubjectPattern: options.oidcSubject,
    oidcAudience: options.oidcAudience,
  };
}

function resolveExpiresAt(expiresIn?: string): number | undefined {
  if (!expiresIn) return undefined;
  const days = Number.parseInt(expiresIn, 10);
  if (Number.isNaN(days) || days <= 0) {
    throw new Error("--expires-in must be a positive number of days.");
  }
  return Date.now() + days * DAY_MS;
}

function formatDate(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleDateString() : pc.dim("never");
}

export async function serviceAccountCreate(options: ServiceAccountCreateOptions) {
  const spinner = ora("Checking authentication...").start();

  try {
    const oidcArgs = resolveOidcArgs(options);
    const expiresAt = resolveExpiresAt(options.expiresIn);

    await requireSession(spinner);

    spinner.text = "Verifying password...";
    const password = await getPasswordFromStorage();
    if (!password) {
      fail(spinner, NO_PASSWORD_MESSAGE);
    }

    spinner.text = "Loading configuration...";
    const projectId = await requireProjectId(spinner, options.project);

    spinner.text = "Fetching project details...";
    const api = getApi();
    const user = await api.getFullUser();

    if (!user.publicKey || !user.encryptedPrivateKey || !user.salt) {
      fail(spinner, "Encryption keys not set up. Run 'relic' to set up your keys.");
    }

    const project = await api.getProject(projectId);

    spinner.text = "Generating service account keys...";
    const { createServiceAccountKeys, unwrapProjectKey, wrapAESKeyWithRSA, importPublicKey } =
      await import("@repo/crypto");
    const { generateServiceToken, extractServiceTokenPrefix, hashKey } =
      await import("@repo/backend/convex/lib/crypto");

    const rawToken = generateServiceToken();
    const hashedToken = await hashKey(rawToken);
    const tokenPrefix = extractServiceTokenPrefix(rawToken);

    const saKeys = await createServiceAccountKeys(rawToken);

    const projectKey = await unwrapProjectKey(
      project.encryptedProjectKey,
      user.encryptedPrivateKey,
      password,
      user.salt,
    );

    const saPublicKey = await importPublicKey(saKeys.publicKey);
    const encryptedProjectKey = await wrapAESKeyWithRSA(projectKey, saPublicKey);

    spinner.text = "Creating service account...";
    await api.createServiceAccount({
      projectId,
      name: options.name,
      publicKey: saKeys.publicKey,
      encryptedPrivateKey: saKeys.encryptedPrivateKey,
      salt: saKeys.salt,
      encryptedProjectKey,
      hashedToken,
      tokenPrefix,
      expiresAt,
      ...oidcArgs,
    });

    spinner.succeed(pc.green("Service account created"));

    console.log();
    console.log(pc.bold("  Service Token (shown once):"));
    console.log();
    console.log(`  ${pc.cyan(rawToken)}`);
    console.log();
    console.log(pc.dim("  Store this token in your CI provider's secret storage."));
    console.log(pc.dim("  Set it as RELIC_SERVICE_TOKEN in your pipeline environment."));

    if (oidcArgs.oidcIssuer) {
      console.log();
      console.log(pc.dim("  OIDC trust policy:"));
      console.log(pc.dim(`    ${oidcArgs.oidcSubjectPattern}`));
      console.log(pc.dim("  OIDC token will be auto-detected in supported CI environments."));
    }
    console.log();

    trackEvent("service_account_created", { projectId, hasOidc: !!oidcArgs.oidcIssuer });
  } catch (err) {
    await handleError(spinner, err);
  }
}

export async function serviceAccountList(options: { project?: string }) {
  const spinner = ora("Checking authentication...").start();

  try {
    await requireSession(spinner);
    const projectId = await requireProjectId(spinner, options.project);

    spinner.text = "Fetching service accounts...";
    const accounts = await getApi().listServiceAccounts(projectId);

    spinner.stop();

    if (accounts.length === 0) {
      console.log(pc.dim("\n  No service accounts found for this project.\n"));
      return;
    }

    console.log();
    for (const sa of accounts) {
      const status = sa.revokedAt
        ? pc.red("revoked")
        : sa.expiresAt && sa.expiresAt < Date.now()
          ? pc.yellow("expired")
          : pc.green("active");
      const oidc = sa.oidcIssuer ? pc.cyan("enabled") : pc.dim("off");

      console.log(`  ${pc.bold(sa.name)}`);
      console.log(`    Token:   ${pc.dim(`${sa.tokenPrefix}...`)}`);
      console.log(`    Status:  ${status}`);
      console.log(`    OIDC:    ${oidc}`);
      if (sa.oidcIssuer) {
        console.log(`    Issuer:  ${pc.dim(sa.oidcIssuer)}`);
        console.log(`    Subject: ${pc.dim(sa.oidcSubjectPattern ?? "")}`);
      }
      console.log(`    Expires: ${formatDate(sa.expiresAt)}`);
      console.log(`    Used:    ${formatDate(sa.lastUsedAt)}`);
      console.log(`    Created: ${new Date(sa.createdAt).toLocaleDateString()}`);
      console.log();
    }
  } catch (err) {
    await handleError(spinner, err);
  }
}

export async function serviceAccountRevoke(options: { project?: string; name: string }) {
  const spinner = ora("Checking authentication...").start();

  try {
    await requireSession(spinner);
    const projectId = await requireProjectId(spinner, options.project);

    spinner.text = "Fetching service accounts...";
    const api = getApi();
    const accounts = await api.listServiceAccounts(projectId);

    const target = accounts.find((sa) => sa.name === options.name);
    if (!target) {
      fail(spinner, `Service account "${options.name}" not found.`);
    }

    if (target.revokedAt) {
      fail(spinner, `Service account "${options.name}" is already revoked.`);
    }

    spinner.text = "Revoking service account...";
    await api.revokeServiceAccount(target.id);

    spinner.succeed(pc.green(`Service account "${options.name}" revoked`));

    trackEvent("service_account_revoked", { projectId });
  } catch (err) {
    await handleError(spinner, err);
  }
}
