import {
  isValidScope,
  type SecretScope,
  type SecretValueType,
  validateBulkImportJson,
} from "@repo/bulk-import";
import pc from "picocolors";
import type { BulkSecretInput, BulkUpdateResult } from "./api";
import type { SkippedEntry, SourceResult } from "./import-sources";

export const IMPORT_BATCH_SIZE = 100;

export type ConflictMode = "overwrite" | "skip";

export interface ExistingSecret {
  id: string;
  key: string;
  scope: SecretScope;
  valueType: SecretValueType;
  value?: string;
}

export interface PlannedSecret {
  key: string;
  value: string;
  valueType: SecretValueType;
  scope: SecretScope;
  existingId?: string;
}

export interface InvalidEntry {
  label: string;
  message: string;
}

export interface ImportPlan {
  create: PlannedSecret[];
  overwrite: PlannedSecret[];
  unchanged: PlannedSecret[];
  skipped: SkippedEntry[];
  invalid: InvalidEntry[];
}

function entryLabel(item: unknown, index: number): string {
  if (typeof item === "object" && item !== null && "key" in item && typeof item.key === "string") {
    return item.key || `entry #${index + 1}`;
  }
  return `entry #${index + 1}`;
}

function explicitScopes(items: unknown[]): Map<string, SecretScope> {
  const scopes = new Map<string, SecretScope>();
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const { key, scope } = item as { key?: unknown; scope?: unknown };
    if (typeof key === "string" && isValidScope(scope) && !scopes.has(key)) {
      scopes.set(key, scope);
    }
  }
  return scopes;
}

export function buildImportPlan(
  source: Pick<SourceResult, "items" | "skipped" | "invalidLines">,
  existing: ExistingSecret[],
  defaultScope?: SecretScope,
): ImportPlan {
  const plan: ImportPlan = {
    create: [],
    overwrite: [],
    unchanged: [],
    skipped: [...source.skipped],
    invalid: source.invalidLines.map((l) => ({ label: `line ${l.line}`, message: l.message })),
  };

  if (source.items.length === 0) return plan;

  const validation = validateBulkImportJson(source.items);
  for (const error of validation.errors) {
    const label =
      error.index !== undefined ? entryLabel(source.items[error.index], error.index) : "input";
    const message = error.message.startsWith("Duplicate key")
      ? "Duplicate key (first occurrence kept)"
      : error.message;
    plan.invalid.push({ label, message });
  }

  const scopes = explicitScopes(source.items);
  const existingByKey = new Map(existing.map((s) => [s.key, s]));

  for (const secret of validation.secrets) {
    const current = existingByKey.get(secret.key);
    const planned: PlannedSecret = {
      key: secret.key,
      value: String(secret.value),
      valueType: secret.type,
      scope: scopes.get(secret.key) ?? defaultScope ?? current?.scope ?? "shared",
      existingId: current?.id,
    };

    if (!current) {
      plan.create.push(planned);
    } else if (
      current.value === planned.value &&
      current.scope === planned.scope &&
      current.valueType === planned.valueType
    ) {
      plan.unchanged.push(planned);
    } else {
      plan.overwrite.push(planned);
    }
  }

  return plan;
}

export type ImportDecision =
  | { action: "proceed"; mode: ConflictMode }
  | { action: "nothing" }
  | { action: "prompt-conflicts" }
  | { action: "prompt-confirm" }
  | { action: "error"; message: string };

export function decideImport(
  plan: ImportPlan,
  options: { overwrite?: boolean; skipExisting?: boolean; yes?: boolean; interactive: boolean },
): ImportDecision {
  if (options.overwrite && options.skipExisting) {
    return { action: "error", message: "Use either --overwrite or --skip-existing, not both." };
  }

  const explicitMode: ConflictMode | undefined = options.overwrite
    ? "overwrite"
    : options.skipExisting
      ? "skip"
      : undefined;
  const hasConflicts = plan.overwrite.length > 0;

  if (plan.create.length === 0 && (!hasConflicts || explicitMode === "skip")) {
    return { action: "nothing" };
  }

  if (hasConflicts && !explicitMode) {
    if (!options.interactive) {
      return {
        action: "error",
        message: `${plan.overwrite.length} secret(s) already exist with different values. Re-run with --overwrite or --skip-existing.`,
      };
    }
    return { action: "prompt-conflicts" };
  }

  if (!explicitMode && !options.yes && options.interactive) {
    return { action: "prompt-confirm" };
  }

  return { action: "proceed", mode: explicitMode ?? "skip" };
}

export function selectWrites(plan: ImportPlan, mode: ConflictMode): PlannedSecret[] {
  return mode === "overwrite" ? [...plan.create, ...plan.overwrite] : [...plan.create];
}

export function canDeleteSource(plan: ImportPlan, mode: ConflictMode): boolean {
  return (
    plan.invalid.length === 0 &&
    plan.skipped.length === 0 &&
    (mode === "overwrite" || plan.overwrite.length === 0)
  );
}

export class ImportBatchError extends Error {
  override cause?: unknown;

  constructor(
    public readonly written: number,
    public readonly total: number,
    cause: unknown,
  ) {
    super(written > 0 ? `Import stopped after ${written} of ${total} secrets` : "Import failed");
    this.name = "ImportBatchError";
    this.cause = cause;
  }
}

export interface ApplyImportContext {
  environmentId: string;
  folderId?: string;
  encrypt: (value: string) => Promise<string>;
  updateSecretBulk: (args: {
    environmentId: string;
    folderId?: string;
    secrets: BulkSecretInput[];
    mode?: "skip" | "overwrite";
  }) => Promise<BulkUpdateResult>;
  batchSize?: number;
  onProgress?: (written: number, total: number) => void;
}

export async function applyImportPlan(
  writes: PlannedSecret[],
  ctx: ApplyImportContext,
): Promise<{ created: number; updated: number }> {
  const batchSize = ctx.batchSize ?? IMPORT_BATCH_SIZE;
  let created = 0;
  let updated = 0;
  let written = 0;

  for (let start = 0; start < writes.length; start += batchSize) {
    const batch = writes.slice(start, start + batchSize);

    try {
      const secrets = await Promise.all(
        batch.map(async (s) => ({
          secretId: s.existingId,
          key: s.key,
          encryptedValue: await ctx.encrypt(s.value),
          valueType: s.valueType,
          scope: s.scope,
        })),
      );

      // NOTE: "overwrite" makes backend failures (e.g. the environment limit) throw instead of
      // silently skipping; skip-existing is already enforced by filtering the writes
      const result = await ctx.updateSecretBulk({
        environmentId: ctx.environmentId,
        folderId: ctx.folderId,
        secrets,
        mode: "overwrite",
      });
      created += result.createdCount;
      updated += result.updatedCount;
    } catch (error) {
      throw new ImportBatchError(written, writes.length, error);
    }

    written += batch.length;
    ctx.onProgress?.(written, writes.length);
  }

  return { created, updated };
}

function section(
  lines: string[],
  title: string,
  rows: Array<{ label: string; note?: string }>,
  marker: string,
) {
  if (rows.length === 0) return;
  lines.push(`  ${title} ${pc.dim(`(${rows.length})`)}`);
  const width = Math.min(Math.max(...rows.map((r) => r.label.length)), 40);
  for (const row of rows) {
    const note = row.note ? `  ${pc.dim(row.note)}` : "";
    lines.push(`    ${marker} ${row.label.padEnd(width)}${note}`);
  }
  lines.push("");
}

export function formatImportPlan(plan: ImportPlan, mode?: ConflictMode): string[] {
  const lines: string[] = [];

  section(
    lines,
    pc.green("New"),
    plan.create.map((s) => ({ label: s.key, note: s.scope })),
    pc.green("+"),
  );

  const overwriteTitle =
    mode === "overwrite"
      ? pc.yellow("Existing, will be overwritten")
      : mode === "skip"
        ? pc.dim("Existing, kept as is")
        : pc.yellow("Existing with different values");
  section(
    lines,
    overwriteTitle,
    plan.overwrite.map((s) => ({ label: s.key, note: s.scope })),
    mode === "skip" ? pc.dim("=") : pc.yellow("~"),
  );

  section(
    lines,
    pc.dim("Unchanged"),
    plan.unchanged.map((s) => ({ label: s.key })),
    pc.dim("="),
  );

  section(
    lines,
    pc.dim("Skipped"),
    plan.skipped.map((s) => ({ label: s.key, note: s.reason })),
    pc.dim("-"),
  );

  section(
    lines,
    pc.red("Invalid"),
    plan.invalid.map((s) => ({ label: s.label, note: s.message })),
    pc.red("!"),
  );

  return lines;
}
