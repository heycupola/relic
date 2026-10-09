import type { SecretScope } from "../types";
import pc from "picocolors";
import { findAdapterFactory, supportedTargets } from "./index";
import {
  computePlan,
  formatPlan,
  hasChanges,
  isProductionLikeName,
  type PushPlan,
  redact,
  secretsToWrite,
} from "./plan";
import {
  PushError,
  type PushDeps,
  PushExitCode,
  type PushExitCodeValue,
  type PushOptions,
  PushUsageError,
} from "./types";
import { splitList } from "./util";

export interface RelicSecretsRequest {
  scopes?: SecretScope[];
  push: { target: string; destination?: string; dryRun?: boolean };
}

const SCOPES: SecretScope[] = ["client", "server", "shared"];
const MAX_DESTINATION_LENGTH = 200;

export interface PushContext {
  deps: PushDeps;
  loadSecrets(
    options: PushOptions,
    request: RelicSecretsRequest,
  ): Promise<{ secrets: Record<string, string> }>;
  confirm(message: string): Promise<boolean>;
  isInteractive: boolean;
  isCi: boolean;
  status(text: string): void;
  stopStatus(): void;
  out(line?: string): void;
  err(line?: string): void;
}

export interface PushResult {
  exitCode: PushExitCodeValue;
  target?: string;
  plan?: PushPlan;
  applied: boolean;
}

export function parseScopes(value: string | undefined): SecretScope[] {
  const scopes = splitList(value).map((scope) => scope.toLowerCase());
  const invalid = scopes.filter((scope) => !SCOPES.includes(scope as SecretScope));
  if (invalid.length > 0) {
    throw new PushUsageError(
      `Invalid --scope: ${invalid.join(", ")}`,
      "Use client, server, or shared (comma separated for several, e.g. client,shared).",
    );
  }
  return [...new Set(scopes)] as SecretScope[];
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export async function executePush(options: PushOptions, ctx: PushContext): Promise<PushResult> {
  let secretValues: string[] = [];
  let target: string | undefined;
  let plan: PushPlan | undefined;

  try {
    if (!options.environment) {
      throw new PushUsageError("--environment is required.");
    }
    if (!options.target) {
      throw new PushUsageError(
        "--target is required.",
        `Supported targets: ${supportedTargets()}.`,
      );
    }

    const scopes = parseScopes(options.scope);

    const factory = findAdapterFactory(options.target);
    if (!factory) {
      throw new PushUsageError(
        `Unknown target: ${options.target}`,
        `Supported targets: ${supportedTargets()}.`,
      );
    }
    target = factory.id;

    ctx.status(`Connecting to ${factory.label}...`);
    const adapter = await factory.create(options, ctx.deps);

    ctx.status(`Reading existing ${factory.label} secrets...`);
    const remote = await adapter.list();

    ctx.status("Fetching secrets from Relic...");
    const { secrets } = await ctx.loadSecrets(options, {
      scopes: scopes.length > 0 ? scopes : undefined,
      push: {
        target: adapter.id,
        destination: adapter.destination.slice(0, MAX_DESTINATION_LENGTH),
        dryRun: options.dryRun ? true : undefined,
      },
    });
    secretValues = Object.values(secrets);
    ctx.stopStatus();

    plan = computePlan(secrets, remote, !!options.prune);
    const toWrite = secretsToWrite(secrets, plan);

    ctx.out();
    for (const line of formatPlan(plan, {
      label: adapter.label,
      destination: adapter.destination,
      prune: !!options.prune,
    })) {
      ctx.out(line);
    }
    ctx.out();

    const problems = adapter.validate?.(toWrite) ?? [];
    if (problems.length > 0) {
      for (const problem of problems) ctx.err(`  ${pc.red("✗")} ${problem}`);
      throw new PushUsageError(
        `${adapter.label} cannot accept ${pluralize(problems.length, "secret")} as-is.`,
        "Rename or fix them in Relic, or narrow the push with --folder or --scope.",
      );
    }

    if (options.dryRun) {
      ctx.out(pc.dim("  Dry run: no changes were made."));
      return { exitCode: PushExitCode.Success, target, plan, applied: false };
    }

    if (!hasChanges(plan)) {
      ctx.out(`  ${pc.green("✓")} ${adapter.label} is already in sync.`);
      return { exitCode: PushExitCode.Success, target, plan, applied: false };
    }

    if (!options.yes) {
      if (!ctx.isInteractive || ctx.isCi) {
        throw new PushUsageError(
          "Refusing to write secrets in a non-interactive session without --yes.",
          "Review the plan above (or run with --dry-run), then re-run with --yes.",
        );
      }

      const needsConfirmation =
        adapter.productionLike ||
        isProductionLikeName(options.environment) ||
        plan.remove.length > 0;

      if (needsConfirmation) {
        const confirmed = await ctx.confirm(
          `Apply these changes to ${adapter.label} ${adapter.destination}?`,
        );
        if (!confirmed) {
          ctx.err(pc.dim("  Push cancelled. No changes were made."));
          return { exitCode: PushExitCode.Cancelled, target, plan, applied: false };
        }
      }
    }

    if (Object.keys(toWrite).length > 0) {
      ctx.status(
        `Writing ${pluralize(Object.keys(toWrite).length, "secret")} to ${adapter.label}...`,
      );
      await adapter.upsert(toWrite);
    }
    if (plan.remove.length > 0) {
      ctx.status(`Removing ${pluralize(plan.remove.length, "secret")} from ${adapter.label}...`);
      await adapter.delete(plan.remove);
    }
    ctx.stopStatus();

    const summary = [`${plan.add.length} added`, `${plan.update.length} updated`];
    if (options.prune) summary.push(`${plan.remove.length} removed`);
    ctx.out(
      `  ${pc.green("✓")} Pushed to ${adapter.label} ${pc.dim(adapter.destination)} ${pc.dim(`(${summary.join(", ")})`)}`,
    );

    return { exitCode: PushExitCode.Success, target, plan, applied: true };
  } catch (err) {
    ctx.stopStatus();
    const message = redact(err instanceof Error ? err.message : String(err), secretValues);

    const upgradeUrl = (err as { upgradeUrl?: unknown } | null)?.upgradeUrl;
    if (typeof upgradeUrl === "string") {
      ctx.err(`  ${pc.red("✗")} ${message}`);
      ctx.err(pc.dim(`    Upgrade at: ${upgradeUrl}`));
      return { exitCode: PushExitCode.Failure, target, plan, applied: false };
    }

    ctx.err(`  ${pc.red("✗")} ${message}`);
    if (err instanceof PushError && err.hint) {
      ctx.err(`    ${pc.dim(err.hint)}`);
    }
    return {
      exitCode: err instanceof PushError ? err.exitCode : PushExitCode.Failure,
      target,
      plan,
      applied: false,
    };
  }
}
