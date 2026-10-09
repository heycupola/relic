import { unlink } from "node:fs/promises";
import * as p from "@clack/prompts";
import {
  getPasswordFromStorage,
  getUserKeyCacheDb,
  hasPassword,
  validateSession,
} from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import type { SecretScope } from "../lib/types";
import ora from "ora";
import pc from "picocolors";
import { getApi, type ProtectedApi } from "../lib/api";
import { parseConvexError } from "../lib/cli";
import { findConfig } from "../lib/config";
import { decryptSecretValue, encryptSecretValue } from "../lib/crypto";
import {
  applyImportPlan,
  buildImportPlan,
  type ConflictMode,
  canDeleteSource,
  decideImport,
  type ExistingSecret,
  formatImportPlan,
  ImportBatchError,
  type ImportPlan,
  selectWrites,
} from "../lib/import-plan";
import {
  type ImportFormat,
  ImportSourceError,
  readImportSource,
  resolveSourceKind,
  type SourceOptions,
  type SourceResult,
} from "../lib/import-sources";
import { exitWithTelemetry } from "../lib/telemetry";
import { resolveProjectKey, resolveUserKeys } from "./run";

const log = createLogger("cli");

const VALID_SCOPES = ["client", "server", "shared"];

export interface ImportOptions extends Omit<SourceOptions, "format"> {
  folder?: string;
  project?: string;
  scope?: string;
  format?: string;
  overwrite?: boolean;
  skipExisting?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  deleteSource?: boolean;
}

class ImportAbort extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = "ImportAbort";
  }
}

function isInteractive(): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function validateOptions(source: string | undefined, options: ImportOptions) {
  if (options.scope && !VALID_SCOPES.includes(options.scope.toLowerCase())) {
    throw new ImportAbort("--scope must be: client, server, or shared");
  }
  if (options.format && !["env", "json"].includes(options.format.toLowerCase())) {
    throw new ImportAbort("--format must be: env or json");
  }
  if (options.overwrite && options.skipExisting) {
    throw new ImportAbort("Use either --overwrite or --skip-existing, not both.");
  }
  if (options.deleteSource && resolveSourceKind(source) !== "file") {
    throw new ImportAbort("--delete-source only works when importing from a file.");
  }
}

async function resolveProjectId(options: ImportOptions): Promise<string> {
  if (options.project) return options.project;
  if (process.env.RELIC_PROJECT_ID) return process.env.RELIC_PROJECT_ID;
  const configResult = await findConfig();
  if (configResult) return configResult.config.project_id;
  throw new ImportAbort(
    "No project selected. Run 'relic init', pass --project <id>, or set RELIC_PROJECT_ID.",
  );
}

async function resolveEncryptedProjectKey(api: ProtectedApi, projectId: string) {
  const [project, user] = await Promise.all([api.getProject(projectId), api.getCurrentUser()]);
  if (project.isArchived) {
    throw new ImportAbort(`Project "${project.name}" is archived.`);
  }
  if (project.ownerId === user.id) {
    return { project, encryptedProjectKey: project.encryptedProjectKey };
  }
  const share = await api.getProjectShare(projectId);
  if (!share) {
    throw new ImportAbort("You don't have access to this project's encryption key.");
  }
  return { project, encryptedProjectKey: share.encryptedProjectKey };
}

interface ImportTarget {
  projectName: string;
  environmentId: string;
  environmentName: string;
  folderId?: string;
  folderName?: string;
  projectKey: CryptoKey;
  existing: ExistingSecret[];
}

async function loadTarget(
  api: ProtectedApi,
  projectId: string,
  options: ImportOptions,
): Promise<ImportTarget> {
  const { project, encryptedProjectKey } = await resolveEncryptedProjectKey(api, projectId);

  const environments = await api.getProjectEnvironments(projectId);
  const environment = environments.find((e) => e.name === options.environment);
  if (!environment) {
    const available = environments.map((e) => e.name).join(", ") || "none";
    throw new ImportAbort(
      `Environment "${options.environment}" not found in ${project.name}. Available: ${available}`,
    );
  }

  const envData = await api.getEnvironmentData(environment.id);
  const folder = options.folder
    ? envData.folders.find((f) => f.name === options.folder)
    : undefined;
  if (options.folder && !folder) {
    const available = envData.folders.map((f) => f.name).join(", ") || "none";
    throw new ImportAbort(
      `Folder "${options.folder}" not found in ${environment.name}. Create it in the TUI first. Available: ${available}`,
    );
  }

  const userKeyDb = await getUserKeyCacheDb();
  const userKeys = await resolveUserKeys(userKeyDb, api);
  const projectKey = await resolveProjectKey(encryptedProjectKey, userKeys, userKeyDb, api);

  const secrets = envData.secrets.filter((s) => (folder ? s.folderId === folder.id : !s.folderId));
  const existing = await Promise.all(
    secrets.map(async (s): Promise<ExistingSecret> => {
      let value: string | undefined;
      try {
        value = await decryptSecretValue(projectKey, s.encryptedValue);
      } catch {
        value = undefined;
      }
      return { id: s.id, key: s.key, scope: s.scope, valueType: s.valueType, value };
    }),
  );

  return {
    projectName: project.name,
    environmentId: environment.id,
    environmentName: environment.name,
    folderId: folder?.id,
    folderName: folder?.name,
    projectKey,
    existing,
  };
}

function printPlan(
  source: SourceResult,
  target: ImportTarget,
  plan: ImportPlan,
  mode?: ConflictMode,
) {
  const destination = [target.projectName, target.environmentName, target.folderName]
    .filter(Boolean)
    .join(" / ");

  console.log();
  console.log(`  ${pc.bold("Import plan")}  ${pc.dim(source.label)} ${pc.dim("→")} ${destination}`);
  console.log();
  for (const line of formatImportPlan(plan, mode)) {
    console.log(line);
  }
  for (const warning of source.warnings) {
    console.log(`  ${pc.yellow("!")} ${pc.yellow(warning)}`);
  }
  if (source.warnings.length > 0) console.log();
}

async function promptConflictMode(conflicts: number): Promise<ConflictMode> {
  const choice = await p.select({
    message: `${plural(conflicts, "secret")} already exist with different values`,
    options: [
      { value: "overwrite", label: "Overwrite them with the imported values" },
      { value: "skip", label: "Keep the current values, import only new secrets" },
      { value: "cancel", label: "Cancel" },
    ],
  });
  if (p.isCancel(choice) || choice === "cancel") {
    throw new ImportAbort("Import cancelled", 0);
  }
  return choice as ConflictMode;
}

async function promptConfirm(message: string): Promise<boolean> {
  const confirmed = await p.confirm({ message });
  return !p.isCancel(confirmed) && confirmed === true;
}

async function maybeDeleteSource(
  source: SourceResult,
  plan: ImportPlan,
  mode: ConflictMode,
  options: ImportOptions,
) {
  if (!options.deleteSource || !source.filePath) return;

  if (!canDeleteSource(plan, mode)) {
    console.log(
      `  ${pc.yellow("!")} ${pc.yellow(`Not deleting ${source.label}: some entries were not imported.`)}`,
    );
    return;
  }

  const confirmed = isInteractive()
    ? await promptConfirm(`Delete ${source.label}?`)
    : options.yes === true;
  if (!confirmed) {
    console.log(pc.dim(`  Kept ${source.label}.`));
    return;
  }

  await unlink(source.filePath);
  console.log(`  ${pc.green("✓")} Deleted ${source.label}`);
}

function printNextSteps(source: SourceResult, options: ImportOptions) {
  const runCommand = `relic run -e ${options.environment}${options.folder ? ` -f ${options.folder}` : ""} -- <command>`;
  console.log();
  console.log(`  ${pc.dim("Next steps:")}`);
  if (source.kind === "file" && source.format === "env" && !options.deleteSource) {
    console.log(
      `    ${pc.dim("•")} Delete ${pc.white(source.label)} so plaintext secrets don't stay on disk`,
    );
  }
  console.log(`    ${pc.dim("•")} Load secrets from Relic instead: ${pc.cyan(runCommand)}`);
  console.log();
}

async function runImport(source: string | undefined, options: ImportOptions, startTime: number) {
  validateOptions(source, options);
  const defaultScope = options.scope?.toLowerCase() as SecretScope | undefined;
  const format = options.format?.toLowerCase() as ImportFormat | undefined;

  const spinner = ora("Checking authentication...").start();
  const api = getApi();
  let sourceResult: SourceResult;
  let target: ImportTarget;

  try {
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      throw new ImportAbort("Not logged in. Run 'relic login' first.");
    }
    if (!(await hasPassword()) || !(await getPasswordFromStorage())) {
      throw new ImportAbort(
        "No password available. Run 'relic' to set up or unlock your password.",
      );
    }

    const projectId = await resolveProjectId(options);

    spinner.text = "Reading source...";
    sourceResult = await readImportSource(source, { ...options, format });

    spinner.text = "Loading target environment...";
    target = await loadTarget(api, projectId, options);
  } finally {
    spinner.stop();
  }

  const plan = buildImportPlan(sourceResult, target.existing, defaultScope);
  const explicitMode = options.overwrite ? "overwrite" : options.skipExisting ? "skip" : undefined;
  printPlan(sourceResult, target, plan, explicitMode);

  if (options.dryRun) {
    console.log(pc.dim("  Dry run: nothing was imported."));
    console.log();
    trackEvent("cli_import_completed", {
      source: sourceResult.kind,
      dry_run: true,
      new_count: plan.create.length,
      conflict_count: plan.overwrite.length,
      duration_ms: Date.now() - startTime,
    });
    return;
  }

  let mode: ConflictMode;
  const decision = decideImport(plan, { ...options, interactive: isInteractive() });
  switch (decision.action) {
    case "error":
      throw new ImportAbort(decision.message);
    case "nothing":
      console.log(pc.dim("  Nothing to import."));
      console.log();
      return;
    case "prompt-conflicts":
      mode = await promptConflictMode(plan.overwrite.length);
      break;
    case "prompt-confirm": {
      const writes = selectWrites(plan, "skip").length;
      const where = target.folderName
        ? `${target.environmentName}/${target.folderName}`
        : target.environmentName;
      if (!(await promptConfirm(`Import ${plural(writes, "secret")} into ${where}?`))) {
        throw new ImportAbort("Import cancelled", 0);
      }
      mode = "skip";
      break;
    }
    default:
      mode = decision.mode;
  }

  const writes = selectWrites(plan, mode);
  const uploadSpinner = ora(
    `Encrypting and uploading ${plural(writes.length, "secret")}...`,
  ).start();
  const result = await applyImportPlan(writes, {
    environmentId: target.environmentId,
    folderId: target.folderId,
    encrypt: (value) => encryptSecretValue(target.projectKey, value),
    updateSecretBulk: (args) => api.updateSecretBulk(args),
    onProgress: (written, total) => {
      uploadSpinner.text = `Encrypting and uploading secrets... ${written}/${total}`;
    },
  }).catch((err) => {
    uploadSpinner.stop();
    throw err;
  });

  const kept = mode === "skip" ? plan.overwrite.length : 0;
  const summary = [
    `${result.created} new`,
    `${result.updated} updated`,
    kept > 0 ? `${kept} kept` : null,
    plan.unchanged.length > 0 ? `${plan.unchanged.length} unchanged` : null,
  ]
    .filter(Boolean)
    .join(", ");
  uploadSpinner.succeed(pc.green(`Imported ${plural(writes.length, "secret")} (${summary})`));

  trackEvent("cli_import_completed", {
    source: sourceResult.kind,
    success: true,
    mode,
    created_count: result.created,
    updated_count: result.updated,
    unchanged_count: plan.unchanged.length,
    skipped_count: plan.skipped.length + kept,
    invalid_count: plan.invalid.length,
    duration_ms: Date.now() - startTime,
  });

  await maybeDeleteSource(sourceResult, plan, mode, options);
  printNextSteps(sourceResult, options);
}

export default async function importSecrets(source: string | undefined, options: ImportOptions) {
  const startTime = Date.now();
  trackEvent("cli_import_started", {
    source: resolveSourceKind(source),
    has_folder: !!options.folder,
    has_scope: !!options.scope,
    dry_run: !!options.dryRun,
  });

  try {
    await runImport(source, options, startTime);
  } catch (err) {
    if (err instanceof ImportAbort) {
      if (err.message) {
        const output = err.exitCode === 0 ? pc.dim(`  ${err.message}`) : pc.red(`  ${err.message}`);
        console.error(output);
      }
      if (err.exitCode !== 0) {
        trackEvent("cli_import_completed", { success: false, duration_ms: Date.now() - startTime });
      }
      await exitWithTelemetry(err.exitCode);
    }

    log.error("Import failed", err);
    trackEvent("cli_import_completed", { success: false, duration_ms: Date.now() - startTime });

    const message =
      err instanceof ImportSourceError
        ? err.message
        : err instanceof ImportBatchError
          ? `${err.message}: ${parseConvexError(err.cause).message}`
          : parseConvexError(err).message;
    ora().fail(pc.red(message));
    await exitWithTelemetry(1);
  }
}
