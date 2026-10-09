import type { FunctionReturnType, WithoutSystemFields } from "convex/server";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { notFoundError } from "./errors";

export type User = FunctionReturnType<typeof components.betterAuth.user.loadUserById>;

type ComponentReaderCtx = Pick<QueryCtx, "runQuery">;

export async function loadUser(ctx: ComponentReaderCtx, userId: string): Promise<User> {
  return await ctx.runQuery(components.betterAuth.user.loadUserById, {
    userId: userId as BetterAuthId<"user">,
  });
}

export async function findUser(ctx: ComponentReaderCtx, userId: string): Promise<User | null> {
  try {
    return await loadUser(ctx, userId);
  } catch {
    return null;
  }
}

export async function getProjectOrThrow(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"project">,
): Promise<Doc<"project">> {
  const project = await ctx.db.get(projectId);
  if (!project) notFoundError("project");
  return project;
}

export async function listActiveOwnedProjects(
  ctx: Pick<QueryCtx, "db">,
  ownerId: string,
): Promise<Doc<"project">[]> {
  return await ctx.db
    .query("project")
    .withIndex("by_owner_archived", (q) => q.eq("ownerId", ownerId).eq("isArchived", false))
    .collect();
}

export async function listActiveSharesByProject(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"project">,
): Promise<Doc<"projectShare">[]> {
  return await ctx.db
    .query("projectShare")
    .withIndex("by_project_active", (q) => q.eq("projectId", projectId).eq("revokedAt", undefined))
    .collect();
}

export async function listActiveSharesByUser(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
): Promise<Doc<"projectShare">[]> {
  return await ctx.db
    .query("projectShare")
    .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("revokedAt", undefined))
    .collect();
}

export async function findActiveShare(
  ctx: Pick<QueryCtx, "db">,
  projectId: Id<"project">,
  userId: string,
): Promise<Doc<"projectShare"> | null> {
  return await ctx.db
    .query("projectShare")
    .withIndex("by_project_user_active", (q) =>
      q.eq("projectId", projectId).eq("userId", userId).eq("revokedAt", undefined),
    )
    .first();
}

export type ActionLogEntry = Omit<WithoutSystemFields<Doc<"actionLog">>, "timestamp">;

export async function insertActionLog(
  ctx: Pick<MutationCtx, "db">,
  entry: ActionLogEntry,
): Promise<void> {
  await ctx.db.insert("actionLog", { ...entry, timestamp: Date.now() });
}
