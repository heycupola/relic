import {
  formatRotationAge,
  formatRotationStatus,
  isValidRotationDays,
  MAX_ROTATION_DAYS,
  MIN_ROTATION_DAYS,
  type RotationStatus,
} from "@repo/backend";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import {
  type Environment,
  getApi,
  getRotationStatusViaServiceToken,
  type ProjectRotationStatus,
  type SecretRotationEntry,
} from "../lib/api";
import {
  hasActiveSession,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  parseConvexError,
  resolveProjectIdWithConfig,
} from "../lib/cli";
import { resolveOidcToken } from "../lib/oidc";
import { exitWithTelemetry } from "../lib/telemetry";

export interface RotationStatusOptions {
  environment?: string;
  project?: string;
  json?: boolean;
  failOnOverdue?: boolean;
}

export interface RotationTargetOptions {
  environment?: string;
  folder?: string;
  project?: string;
}

export interface RotationSummary {
  total: number;
  ok: number;
  dueSoon: number;
  overdue: number;
  noPolicy: number;
}

export class RotationCommandError extends Error {}

export function parseRotationDays(input: string): number {
  const trimmed = input.trim();
  const days = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!isValidRotationDays(days)) {
    throw new RotationCommandError(
      `--every must be a whole number of days between ${MIN_ROTATION_DAYS} and ${MAX_ROTATION_DAYS}.`,
    );
  }
  return days;
}

export function summarizeRotation(entries: SecretRotationEntry[]): RotationSummary {
  return {
    total: entries.length,
    ok: entries.filter((e) => e.status === "ok").length,
    dueSoon: entries.filter((e) => e.status === "due_soon").length,
    overdue: entries.filter((e) => e.status === "overdue").length,
    noPolicy: entries.filter((e) => e.status === "no_policy").length,
  };
}

export function getRotationExitCode(entries: SecretRotationEntry[], failOnOverdue = false): number {
  return failOnOverdue && entries.some((e) => e.status === "overdue") ? 1 : 0;
}

export function buildRotationJson(args: {
  projectId: string;
  projectName: string;
  generatedAt: number;
  secrets: SecretRotationEntry[];
}) {
  return {
    projectId: args.projectId,
    projectName: args.projectName,
    generatedAt: new Date(args.generatedAt).toISOString(),
    summary: summarizeRotation(args.secrets),
    secrets: args.secrets.map((s) => ({
      key: s.key,
      environment: s.environmentName,
      folder: s.folderName,
      ageDays: s.ageDays,
      valueChangedAt: new Date(s.valueChangedAt).toISOString(),
      rotateEveryDays: s.rotateEveryDays,
      policySource: s.policySource,
      status: s.status,
      dueAt: s.dueAt === null ? null : new Date(s.dueAt).toISOString(),
    })),
  };
}

function colorStatus(status: RotationStatus, text: string): string {
  switch (status) {
    case "overdue":
      return pc.red(text);
    case "due_soon":
      return pc.yellow(text);
    case "ok":
      return pc.green(text);
    case "no_policy":
      return pc.dim(text);
  }
}

function formatPolicy(entry: SecretRotationEntry): string {
  if (entry.rotateEveryDays === null) return "-";
  const suffix = entry.policySource === "environment" ? " (env)" : "";
  return `${entry.rotateEveryDays}d${suffix}`;
}

export function formatRotationTable(entries: SecretRotationEntry[]): string[] {
  const rows = entries.map((entry) => ({
    entry,
    key: entry.folderName ? `${entry.folderName}/${entry.key}` : entry.key,
    environment: entry.environmentName,
    age: formatRotationAge(entry.ageDays),
    policy: formatPolicy(entry),
    status: formatRotationStatus(entry.status),
  }));

  const width = (values: string[], header: string) =>
    Math.max(header.length, ...values.map((value) => value.length));
  const keyWidth = width(
    rows.map((r) => r.key),
    "KEY",
  );
  const envWidth = width(
    rows.map((r) => r.environment),
    "ENV",
  );
  const ageWidth = width(
    rows.map((r) => r.age),
    "AGE",
  );
  const policyWidth = width(
    rows.map((r) => r.policy),
    "POLICY",
  );

  const lines = [
    pc.dim(
      `  ${"KEY".padEnd(keyWidth)}  ${"ENV".padEnd(envWidth)}  ${"AGE".padStart(ageWidth)}  ${"POLICY".padEnd(policyWidth)}  STATUS`,
    ),
  ];

  for (const row of rows) {
    lines.push(
      `  ${pc.bold(row.key.padEnd(keyWidth))}  ${pc.dim(row.environment.padEnd(envWidth))}  ${row.age.padStart(ageWidth)}  ${pc.dim(row.policy.padEnd(policyWidth))}  ${colorStatus(row.entry.status, row.status)}`,
    );
  }

  return lines;
}

export function findEnvironment(
  environments: Environment[],
  name: string,
): Environment | undefined {
  const needle = name.toLowerCase();
  return environments.find((e) => e.name.toLowerCase() === needle || e.slug === needle);
}

function errorMessage(err: unknown): string {
  return parseConvexError(err).message;
}

async function ensureSession(spinner: ReturnType<typeof ora>) {
  if (!(await hasActiveSession())) throw new RotationCommandError(NOT_LOGGED_IN_MESSAGE);
  spinner.text = "Loading configuration...";
}

async function resolveProjectId(projectId?: string): Promise<string> {
  const resolved = await resolveProjectIdWithConfig(projectId);
  if (!resolved) throw new RotationCommandError(PROJECT_ID_REQUIRED_MESSAGE);
  return resolved;
}

async function resolveEnvironment(projectId: string, name: string): Promise<Environment> {
  const environments = await getApi().getProjectEnvironments(projectId);
  const environment = findEnvironment(environments, name);
  if (!environment) {
    const available = environments.map((e) => e.name).join(", ");
    throw new RotationCommandError(
      `Environment "${name}" not found. Available: ${available || "none"}`,
    );
  }
  return environment;
}

async function resolveSecretId(
  environment: Environment,
  key: string,
  folderName?: string,
): Promise<string> {
  const data = await getApi().getEnvironmentData(environment.id);

  let folderId: string | undefined;
  if (folderName) {
    const folder = data.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
    if (!folder) {
      throw new RotationCommandError(
        `Folder "${folderName}" not found in environment "${environment.name}".`,
      );
    }
    folderId = folder.id;
  }

  const secret = data.secrets.find((s) => s.key === key && s.folderId === folderId);
  if (!secret) {
    const location = folderName ? `${environment.name}/${folderName}` : environment.name;
    throw new RotationCommandError(`Secret "${key}" not found in ${location}.`);
  }
  return secret.id;
}

async function loadRotationStatus(
  options: RotationStatusOptions,
  spinner: ReturnType<typeof ora>,
): Promise<ProjectRotationStatus> {
  const serviceToken = process.env.RELIC_SERVICE_TOKEN;
  if (serviceToken) {
    spinner.text = "Checking secret ages...";
    return await getRotationStatusViaServiceToken(
      serviceToken,
      { environmentName: options.environment },
      await resolveOidcToken(),
    );
  }

  await ensureSession(spinner);
  const projectId = await resolveProjectId(options.project);

  let environmentId: string | undefined;
  if (options.environment) {
    spinner.text = "Resolving environment...";
    environmentId = (await resolveEnvironment(projectId, options.environment)).id;
  }

  spinner.text = "Checking secret ages...";
  return await getApi().getRotationStatus(projectId, environmentId);
}

export async function rotationStatus(options: RotationStatusOptions) {
  const spinner = ora({ text: "Checking authentication...", isSilent: !!options.json }).start();

  try {
    const status = await loadRotationStatus(options, spinner);
    spinner.stop();

    const summary = summarizeRotation(status.secrets);
    const exitCode = getRotationExitCode(status.secrets, options.failOnOverdue);

    trackEvent("rotation_status_checked", {
      total: summary.total,
      overdue: summary.overdue,
      dueSoon: summary.dueSoon,
      json: !!options.json,
      failOnOverdue: !!options.failOnOverdue,
      serviceToken: !!process.env.RELIC_SERVICE_TOKEN,
    });

    process.exitCode = exitCode;

    if (options.json) {
      console.log(JSON.stringify(buildRotationJson(status), null, 2));
      return;
    }

    console.log();
    if (status.secrets.length === 0) {
      console.log(pc.dim("  No secrets found."));
      console.log();
      return;
    }

    for (const line of formatRotationTable(status.secrets)) {
      console.log(line);
    }
    console.log();

    const parts = [
      summary.overdue > 0 ? pc.red(`${summary.overdue} overdue`) : null,
      summary.dueSoon > 0 ? pc.yellow(`${summary.dueSoon} due soon`) : null,
      summary.ok > 0 ? pc.green(`${summary.ok} ok`) : null,
      summary.noPolicy > 0 ? pc.dim(`${summary.noPolicy} without a policy`) : null,
    ].filter(Boolean);
    console.log(`  ${parts.join(pc.dim(" · "))}`);

    if (summary.noPolicy > 0 && summary.noPolicy === summary.total) {
      console.log();
      console.log(
        pc.dim("  Set a policy with ") + pc.white("relic rotation set -e <environment> --every 90"),
      );
    }
    console.log();
  } catch (err) {
    spinner.fail(pc.red(errorMessage(err)));
    await exitWithTelemetry(2);
  }
}

async function applyRotationPolicy(
  key: string | undefined,
  options: RotationTargetOptions,
  rotateEveryDays: number | null,
) {
  const spinner = ora("Checking authentication...").start();

  try {
    if (!options.environment) {
      throw new RotationCommandError(
        "Environment is required. Use -e <environment> with a KEY, or -e <environment> alone for the whole environment.",
      );
    }
    if (!key && options.folder) {
      throw new RotationCommandError("--folder can only be used together with a secret KEY.");
    }

    await ensureSession(spinner);
    const projectId = await resolveProjectId(options.project);

    spinner.text = "Resolving environment...";
    const environment = await resolveEnvironment(projectId, options.environment);
    const api = getApi();
    const policy = rotateEveryDays === null ? null : `every ${rotateEveryDays} days`;

    if (key) {
      spinner.text = "Resolving secret...";
      const secretId = await resolveSecretId(environment, key, options.folder);
      spinner.text = "Updating rotation policy...";
      await api.setSecretRotationPolicy(secretId, rotateEveryDays);
      spinner.succeed(
        pc.green(
          policy
            ? `${key} in ${environment.name} now rotates ${policy}`
            : `Cleared rotation policy for ${key} in ${environment.name}`,
        ),
      );
    } else {
      spinner.text = "Updating rotation policy...";
      await api.setEnvironmentRotationPolicy(environment.id, rotateEveryDays);
      spinner.succeed(
        pc.green(
          policy
            ? `Secrets in ${environment.name} now rotate ${policy}`
            : `Cleared rotation policy for ${environment.name}`,
        ),
      );
    }

    trackEvent(rotateEveryDays === null ? "rotation_policy_cleared" : "rotation_policy_set", {
      target: key ? "secret" : "environment",
      rotateEveryDays,
    });
  } catch (err) {
    spinner.fail(pc.red(errorMessage(err)));
    await exitWithTelemetry(1);
  }
}

export async function rotationSet(
  key: string | undefined,
  options: RotationTargetOptions & { every: string },
) {
  let rotateEveryDays: number;
  try {
    rotateEveryDays = parseRotationDays(options.every);
  } catch (err) {
    console.error(`\n  ${pc.red(errorMessage(err))}\n`);
    await exitWithTelemetry(1);
  }
  await applyRotationPolicy(key, options, rotateEveryDays);
}

export async function rotationClear(key: string | undefined, options: RotationTargetOptions) {
  await applyRotationPolicy(key, options, null);
}
