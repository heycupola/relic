import * as p from "@clack/prompts";
import { validateSession } from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import { ConvexError } from "convex/values";
import ora from "ora";
import pc from "picocolors";
import { getApi, type ProtectedApi, type SecretHistory } from "../lib/api";
import { findConfig } from "../lib/config";
import { decryptSecretValue, getProjectKey } from "../lib/crypto";
import {
  buildHistoryRows,
  type HistoryRow,
  parseVersion,
  renderHistoryTable,
  toHistoryJson,
} from "../lib/history";

const log = createLogger("cli");

export interface HistoryOptions {
  environment: string;
  folder?: string;
  project?: string;
  reveal?: boolean;
  json?: boolean;
  yes?: boolean;
}

export interface RollbackOptions {
  environment: string;
  folder?: string;
  project?: string;
  to: string;
  yes?: boolean;
}

class CommandError extends Error {}

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    let data = err.data;
    while (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        break;
      }
    }
    if (typeof data === "object" && data !== null && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return err instanceof Error ? err.message : String(err);
}

async function resolveProjectId(options: { project?: string }): Promise<string> {
  if (options.project) return options.project;
  if (process.env.RELIC_PROJECT_ID) return process.env.RELIC_PROJECT_ID;

  const configResult = await findConfig();
  if (!configResult) {
    throw new CommandError("No relic.toml found. Run 'relic init' or pass --project <id>.");
  }
  return configResult.config.project_id;
}

async function ensureSession(): Promise<void> {
  const sessionValidation = await validateSession();
  if (!sessionValidation.isValid || sessionValidation.isExpired) {
    throw new CommandError("Not logged in. Run 'relic login' first.");
  }
}

async function confirmOrExit(message: string, yes: boolean | undefined): Promise<void> {
  if (yes) return;

  if (!process.stdin.isTTY) {
    throw new CommandError("Confirmation required. Re-run with --yes in non-interactive shells.");
  }

  const confirmed = await p.confirm({ message, initialValue: false });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Cancelled");
    process.exit(0);
  }
}

async function decryptRows(
  api: ProtectedApi,
  history: SecretHistory,
  rows: HistoryRow[],
): Promise<Map<number, string>> {
  const user = await api.getFullUser();
  if (!user.encryptedPrivateKey || !user.salt) {
    throw new CommandError("No encryption keys found. Run 'relic' to set up your keys first.");
  }

  const projectKey = await getProjectKey(
    history.encryptedProjectKey,
    user.encryptedPrivateKey,
    user.salt,
  );

  const values = new Map<number, string>();
  for (const row of rows) {
    if (row.version === null || !row.encryptedValue) continue;
    values.set(row.version, await decryptSecretValue(projectKey, row.encryptedValue));
  }
  return values;
}

function locationLabel(options: { environment: string; folder?: string }): string {
  return options.folder ? `${options.environment}/${options.folder}` : options.environment;
}

export async function history(key: string, options: HistoryOptions): Promise<void> {
  const spinner = options.json ? null : ora("Checking authentication...").start();

  try {
    await ensureSession();
    const projectId = await resolveProjectId(options);
    const api = getApi();

    if (spinner) spinner.text = "Fetching history...";
    const result = await api.getSecretHistory({
      projectId,
      environmentName: options.environment,
      folderName: options.folder,
      key,
    });
    const rows = buildHistoryRows(result);
    spinner?.stop();

    let values: Map<number, string> | null = null;
    if (options.reveal) {
      await confirmOrExit(
        `Decrypt and print ${rows.length} value${rows.length !== 1 ? "s" : ""} of ${key} to this terminal?`,
        options.yes,
      );
      values = await decryptRows(api, result, rows);
    }

    trackEvent("cli_command_executed", {
      command: "history",
      count: rows.length,
      revealed: !!options.reveal,
    });

    if (options.json) {
      console.log(JSON.stringify(toHistoryJson(result, rows, values, options), null, 2));
      return;
    }

    console.log();
    console.log(
      `  ${pc.bold(key)} ${pc.dim(`in ${locationLabel(options)}`)}${result.secret.isDeleted ? pc.red(" (deleted)") : ""}`,
    );
    console.log();
    for (const line of renderHistoryTable(rows, values)) {
      console.log(`  ${line}`);
    }
    console.log();
    if (result.versions.length === 0) {
      console.log(pc.dim("  No previous versions yet. History starts with the next change."));
    } else {
      console.log(pc.dim(`  Keeping the last ${result.retentionLimit} versions. Roll back with:`));
      const folderFlag = options.folder ? ` -f ${options.folder}` : "";
      console.log(
        pc.dim(`  relic rollback ${key} -e ${options.environment}${folderFlag} --to <version>`),
      );
    }
    console.log();
  } catch (err) {
    log.error("History failed", err);
    if (spinner) {
      spinner.fail(pc.red(errorMessage(err)));
    } else {
      console.error(pc.red(errorMessage(err)));
    }
    process.exit(1);
  }
}

export async function rollback(key: string, options: RollbackOptions): Promise<void> {
  const version = parseVersion(options.to);
  if (version === null) {
    console.error(pc.red("Error: --to must be a version number, e.g. --to 3"));
    process.exit(1);
  }

  const spinner = ora("Checking authentication...").start();

  try {
    await ensureSession();
    const projectId = await resolveProjectId(options);
    const api = getApi();

    spinner.text = "Fetching history...";
    const result = await api.getSecretHistory({
      projectId,
      environmentName: options.environment,
      folderName: options.folder,
      key,
    });

    if (!result.secret.isDeleted && result.secret.currentVersion === version) {
      spinner.info(`v${version} is already the current value of ${key}`);
      return;
    }

    const target = result.versions.find((entry) => entry.version === version);
    if (!target) {
      const available = result.versions.map((entry) => `v${entry.version}`).join(", ");
      throw new CommandError(
        available
          ? `Version ${version} not found. Available versions: ${available}`
          : `${key} has no previous versions to roll back to`,
      );
    }
    spinner.stop();

    const action = result.secret.isDeleted ? "Restore deleted secret" : "Roll back";
    await confirmOrExit(
      `${action} ${key} in ${locationLabel(options)} to v${version}?`,
      options.yes,
    );

    spinner.start(`Restoring v${version}...`);
    const restored = await api.restoreSecretVersion(result.secret.id, version);

    trackEvent("cli_command_executed", {
      command: "rollback",
      was_deleted: restored.wasDeleted,
    });

    spinner.succeed(
      pc.green(
        restored.wasDeleted
          ? `Restored deleted secret ${key} from v${version}`
          : `Rolled back ${key} to v${version}`,
      ),
    );
  } catch (err) {
    log.error("Rollback failed", err);
    spinner.fail(pc.red(errorMessage(err)));
    process.exit(1);
  }
}
