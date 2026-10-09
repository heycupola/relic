import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi, type ProtectedApi } from "../lib/api";
import {
  getErrorMessage,
  hasActiveSession,
  isAuthError,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  resolveProjectIdWithConfig,
} from "../lib/cli";
import { type JsonErrorCode, printJson, printJsonError } from "../lib/json";
import { exitWithTelemetry } from "../lib/telemetry";
import type { SecretScope } from "../lib/types";

const SCOPES: SecretScope[] = ["client", "server", "shared"];

export interface SecretsOptions {
  environment: string;
  folder?: string;
  scope?: string;
  project?: string;
  json?: boolean;
}

export interface SecretNameEntry {
  name: string;
  scope: SecretScope;
  folder: string | null;
}

export interface SecretNamesResult {
  projectId: string;
  environment: string;
  folder: string | null;
  folders: string[];
  secrets: SecretNameEntry[];
}

export class SecretNamesError extends Error {
  constructor(
    message: string,
    readonly code: JsonErrorCode,
  ) {
    super(message);
  }
}

type SecretNamesApi = Pick<ProtectedApi, "getProjectEnvironments" | "getEnvironmentData">;

export async function listSecretNames(
  api: SecretNamesApi,
  projectId: string,
  options: { environment: string; folder?: string; scope?: SecretScope },
): Promise<SecretNamesResult> {
  const environments = await api.getProjectEnvironments(projectId);
  const env = environments.find((e) => e.name.toLowerCase() === options.environment.toLowerCase());
  if (!env) {
    const available = environments.map((e) => e.name).join(", ");
    throw new SecretNamesError(
      `Environment "${options.environment}" not found. Available: ${available || "none"}`,
      "environment_not_found",
    );
  }

  const data = await api.getEnvironmentData(env.id);
  const folderNames = new Map(data.folders.map((f) => [f.id, f.name]));

  let secrets = data.secrets;
  let folderName: string | null = null;
  if (options.folder) {
    const target = data.folders.find((f) => f.name.toLowerCase() === options.folder!.toLowerCase());
    if (!target) {
      const available = data.folders.map((f) => f.name).join(", ");
      throw new SecretNamesError(
        `Folder "${options.folder}" not found. Available: ${available || "none"}`,
        "folder_not_found",
      );
    }
    folderName = target.name;
    secrets = secrets.filter((s) => s.folderId === target.id);
  }
  if (options.scope) {
    secrets = secrets.filter((s) => s.scope === options.scope);
  }

  return {
    projectId,
    environment: env.name,
    folder: folderName,
    folders: data.folders.map((f) => f.name),
    secrets: secrets
      .map((s) => ({
        name: s.key,
        scope: s.scope,
        folder: s.folderId ? (folderNames.get(s.folderId) ?? null) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function renderSecretNames(result: SecretNamesResult): void {
  const location = result.folder ? `${result.environment}/${result.folder}` : result.environment;
  const count = result.secrets.length;
  console.log(`${pc.bold(location)} ${pc.dim(`· ${count} secret${count !== 1 ? "s" : ""}`)}`);

  if (count === 0) return;
  console.log();

  const width = Math.max(...result.secrets.map((s) => s.name.length));
  for (const secret of result.secrets) {
    const folder = secret.folder && !result.folder ? pc.dim(` ${secret.folder}/`) : "";
    console.log(`  ${secret.name.padEnd(width)}  ${pc.dim(secret.scope)}${folder}`);
  }
}

export default async function secrets(options: SecretsOptions) {
  const json = !!options.json;
  const spinner = json ? null : ora("Connecting...").start();

  const fail = async (code: JsonErrorCode, message: string): Promise<never> => {
    if (json) {
      printJsonError(code, message);
    } else {
      spinner?.stop();
      console.error(pc.red(message));
    }
    return exitWithTelemetry(1);
  };

  const scope = options.scope?.toLowerCase() as SecretScope | undefined;
  if (scope && !SCOPES.includes(scope)) {
    await fail("invalid_option", "--scope must be: client, server, or shared");
  }

  try {
    if (!(await hasActiveSession())) {
      await fail("not_logged_in", NOT_LOGGED_IN_MESSAGE);
    }

    const projectId = await resolveProjectIdWithConfig(options.project);
    if (!projectId) {
      return fail("no_config", PROJECT_ID_REQUIRED_MESSAGE);
    }

    if (spinner) spinner.text = "Fetching secret names...";
    const result = await listSecretNames(getApi(), projectId, {
      environment: options.environment,
      folder: options.folder,
      scope,
    });

    trackEvent("cli_command_executed", { command: "secrets", count: result.secrets.length, json });
    spinner?.stop();

    if (json) {
      printJson(result);
    } else {
      renderSecretNames(result);
    }
  } catch (err) {
    if (err instanceof SecretNamesError) {
      return fail(err.code, err.message);
    }
    if (isAuthError(err)) {
      return fail("not_logged_in", NOT_LOGGED_IN_MESSAGE);
    }
    return fail("failed", `Error: ${getErrorMessage(err, "Failed to fetch secret names")}`);
  }
}
