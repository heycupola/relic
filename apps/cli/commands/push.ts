import { Database } from "bun:sqlite";
import * as p from "@clack/prompts";
import {
  getPasswordFromStorage,
  getUserKeyCacheDb,
  hasPassword,
  validateSession,
} from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import ora from "ora";
import { getApi } from "../lib/api";
import { findConfig } from "../lib/config";
import { createDefaultDeps } from "../lib/push/deps";
import { executePush } from "../lib/push/execute";
import { PushError, PushExitCode, type PushOptions, PushUsageError } from "../lib/push/types";
import {
  isCiEnvironment,
  type PrepareSecretsResult,
  prepareSecrets,
  prepareSecretsWithApiKey,
  prepareSecretsWithServiceToken,
  resolveProjectId,
  type RunOptions,
  type SecretFetchOptions,
} from "./run";

const log = createLogger("cli");

function toRunOptions(options: PushOptions, fetchOptions: SecretFetchOptions): RunOptions {
  return {
    environment: options.environment,
    folder: options.folder,
    project: options.project,
    scope: fetchOptions.scopes?.length === 1 ? fetchOptions.scopes[0] : undefined,
  };
}

async function loadRelicSecrets(
  options: PushOptions,
  fetchOptions: SecretFetchOptions,
): Promise<PrepareSecretsResult> {
  const runOptions = toRunOptions(options, fetchOptions);

  if (process.env.RELIC_SERVICE_TOKEN) {
    return prepareSecretsWithServiceToken(runOptions, fetchOptions);
  }

  const projectId = resolveProjectId(runOptions) ?? (await findConfig())?.config.project_id;
  if (!projectId) {
    throw new PushUsageError(
      "No Relic project found.",
      "Run `relic init`, pass --project <id>, or set RELIC_PROJECT_ID.",
    );
  }

  if (process.env.RELIC_API_KEY) {
    return prepareSecretsWithApiKey(projectId, runOptions, fetchOptions);
  }

  const session = await validateSession();
  if (!session.isValid || session.isExpired) {
    throw new PushError("Not logged in to Relic.", PushExitCode.AuthRequired, "Run `relic login`.");
  }
  if (!(await hasPassword()) || !(await getPasswordFromStorage())) {
    throw new PushError(
      "Could not unlock your Relic keys.",
      PushExitCode.AuthRequired,
      "Run `relic` to set up or re-enter your master password.",
    );
  }

  // Push exports bypass the project cache entirely, so an in-memory database is enough.
  const db = new Database(":memory:");
  const userKeyDb = await getUserKeyCacheDb();
  return prepareSecrets(projectId, runOptions, db, userKeyDb, getApi(), fetchOptions);
}

export default async function push(options: PushOptions) {
  const spinner = ora();
  const isInteractive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  const startTime = Date.now();

  const result = await executePush(options, {
    deps: createDefaultDeps(),
    loadSecrets: loadRelicSecrets,
    confirm: async (message) => {
      const answer = await p.confirm({ message, initialValue: false });
      return !p.isCancel(answer) && answer === true;
    },
    isInteractive,
    isCi: isCiEnvironment(),
    status: (text) => {
      if (!isInteractive) return;
      spinner.text = text;
      if (!spinner.isSpinning) spinner.start();
    },
    stopStatus: () => {
      if (spinner.isSpinning) spinner.stop();
    },
    out: (line = "") => console.log(line),
    err: (line = "") => console.error(line),
  });

  if (result.exitCode !== PushExitCode.Success) {
    log.error("Push failed", { target: result.target, exitCode: result.exitCode });
  }

  trackEvent("cli_push_completed", {
    target: result.target,
    success: result.exitCode === PushExitCode.Success,
    exit_code: result.exitCode,
    dry_run: !!options.dryRun,
    prune: !!options.prune,
    applied: result.applied,
    added: result.plan?.add.length ?? 0,
    updated: result.plan?.update.length ?? 0,
    removed: result.plan?.remove.length ?? 0,
    duration_ms: Date.now() - startTime,
  });

  process.exit(result.exitCode);
}
