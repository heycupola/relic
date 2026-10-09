import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  getRotationState,
  inferValueChangedAt,
  type RotationPolicySource,
  type RotationStatus,
  resolveRotationPolicy,
} from "./rotation";

export type SecretRotationEntry = {
  secretId: Id<"secret">;
  key: string;
  environmentId: Id<"environment">;
  environmentName: string;
  folderId: Id<"folder"> | null;
  folderName: string | null;
  valueChangedAt: number;
  ageDays: number;
  rotateEveryDays: number | null;
  policySource: RotationPolicySource | null;
  status: RotationStatus;
  dueAt: number | null;
  daysUntilDue: number | null;
};

export async function loadKeyRotationTimestamps(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"project">,
): Promise<number[]> {
  const rotations = await ctx.db
    .query("keyRotation")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return rotations.map((rotation) => rotation.createdAt);
}

export async function computeProjectRotationEntries(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"project">,
  options: { environmentId?: Id<"environment">; now: number },
): Promise<SecretRotationEntry[]> {
  const environments = await ctx.db
    .query("environment")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const environmentsById = new Map<Id<"environment">, Doc<"environment">>(
    environments.map((environment) => [environment._id, environment]),
  );

  const folders = await ctx.db
    .query("folder")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  const foldersById = new Map<Id<"folder">, Doc<"folder">>(
    folders.map((folder) => [folder._id, folder]),
  );

  const { environmentId } = options;
  const secrets = environmentId
    ? await ctx.db
        .query("secret")
        .withIndex("by_environment", (q) => q.eq("environmentId", environmentId))
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .collect()
    : await ctx.db
        .query("secret")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .filter((q) => q.eq(q.field("isDeleted"), false))
        .collect();

  const needsInference = secrets.some((secret) => secret.valueChangedAt === undefined);
  const keyRotationTimestamps = needsInference
    ? await loadKeyRotationTimestamps(ctx, projectId)
    : [];

  const entries: SecretRotationEntry[] = [];
  for (const secret of secrets) {
    const environment = environmentsById.get(secret.environmentId);
    if (!environment) continue;

    const folder = secret.folderId ? foldersById.get(secret.folderId) : undefined;
    const valueChangedAt = inferValueChangedAt(secret, keyRotationTimestamps);
    const state = getRotationState({
      valueChangedAt,
      policy: resolveRotationPolicy(secret.rotateEveryDays, environment.rotateEveryDays),
      now: options.now,
    });

    entries.push({
      secretId: secret._id,
      key: secret.key,
      environmentId: environment._id,
      environmentName: environment.name,
      folderId: secret.folderId ?? null,
      folderName: folder?.name ?? null,
      valueChangedAt,
      ...state,
    });
  }

  return entries;
}
