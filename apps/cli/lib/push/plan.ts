import pc from "picocolors";
import type { RemoteSecret } from "./types";

export interface PushPlan {
  add: string[];
  update: string[];
  unchanged: string[];
  remove: string[];
}

export function computePlan(
  local: Record<string, string>,
  remote: RemoteSecret[],
  prune: boolean,
): PushPlan {
  const remoteByName = new Map<string, RemoteSecret>();
  for (const entry of remote) {
    const existing = remoteByName.get(entry.name);
    if (!existing) {
      remoteByName.set(entry.name, entry);
    } else if (existing.value !== entry.value) {
      remoteByName.set(entry.name, { name: entry.name });
    }
  }

  const plan: PushPlan = { add: [], update: [], unchanged: [], remove: [] };

  for (const name of Object.keys(local).sort()) {
    const existing = remoteByName.get(name);
    if (!existing) {
      plan.add.push(name);
    } else if (existing.value !== undefined && existing.value === local[name]) {
      plan.unchanged.push(name);
    } else {
      plan.update.push(name);
    }
  }

  if (prune) {
    plan.remove = [...remoteByName.keys()].filter((name) => !(name in local)).sort();
  }

  return plan;
}

export function hasChanges(plan: PushPlan): boolean {
  return plan.add.length + plan.update.length + plan.remove.length > 0;
}

export function secretsToWrite(
  local: Record<string, string>,
  plan: PushPlan,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of [...plan.add, ...plan.update]) {
    result[name] = local[name] as string;
  }
  return result;
}

export function formatPlan(
  plan: PushPlan,
  context: { label: string; destination: string; prune: boolean },
): string[] {
  const lines: string[] = [];
  lines.push(
    `  ${pc.bold("Push plan")} ${pc.dim("→")} ${context.label} ${pc.dim(context.destination)}`,
  );
  lines.push("");

  for (const name of plan.add) lines.push(`    ${pc.green("+")} ${name}`);
  for (const name of plan.update) lines.push(`    ${pc.yellow("~")} ${name}`);
  for (const name of plan.remove) lines.push(`    ${pc.red("-")} ${name}`);
  for (const name of plan.unchanged) lines.push(`    ${pc.dim(`= ${name}`)}`);

  if (plan.add.length + plan.update.length + plan.remove.length + plan.unchanged.length > 0) {
    lines.push("");
  }

  const summary = [
    pc.green(`${plan.add.length} to add`),
    pc.yellow(`${plan.update.length} to update`),
  ];
  if (plan.unchanged.length > 0) summary.push(pc.dim(`${plan.unchanged.length} unchanged`));
  if (context.prune) {
    summary.push(pc.red(`${plan.remove.length} to remove`));
  }
  lines.push(`  ${summary.join(pc.dim(", "))}`);

  return lines;
}

const MIN_REDACT_LENGTH = 4;

/** Scrubs secret values out of text that came back from a platform before it is printed. */
export function redact(text: string, values: Iterable<string>): string {
  const variants: string[] = [];
  for (const value of values) {
    variants.push(value, JSON.stringify(value).slice(1, -1));
  }

  const sorted = [...new Set(variants)]
    .filter((value) => value.length >= MIN_REDACT_LENGTH)
    .sort((a, b) => b.length - a.length);

  let result = text;
  for (const value of sorted) {
    result = result.split(value).join("[redacted]");
  }
  return result;
}

const PRODUCTION_LIKE_PATTERN = /(^|[-_.\s])(prod|production|live|main|master)($|[-_.\s])/i;

export function isProductionLikeName(name: string | undefined): boolean {
  if (!name) return false;
  return PRODUCTION_LIKE_PATTERN.test(name);
}
