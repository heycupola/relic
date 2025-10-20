import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Context = QueryCtx | MutationCtx;

export async function hasProjectAccess(
  ctx: Context & { userId: Id<"user"> },
  project: Doc<"project">,
): Promise<boolean> {
  if (project.ownerType === "user") {
    return project.ownerId === ctx.userId;
  }

  const membership = await ctx.db
    .query("organizationMember")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.ownerId).eq("userId", ctx.userId),
    )
    .filter((q) => q.eq(q.field("revokedAt"), undefined))
    .first();

  return !!membership;
}

export async function canWriteProject(
  ctx: Context & { userId: Id<"user"> },
  project: Doc<"project">,
): Promise<boolean> {
  if (project.ownerType === "user") {
    return project.ownerId === ctx.userId;
  }

  const membership = await ctx.db
    .query("organizationMember")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.ownerId).eq("userId", ctx.userId),
    )
    .filter((q) => q.eq(q.field("revokedAt"), undefined))
    .first();

  return !!membership && membership.role !== "viewer";
}

export async function canAdminProject(
  ctx: Context & { userId: Id<"user"> },
  project: Doc<"project">,
): Promise<boolean> {
  if (project.ownerType === "user") {
    return project.ownerId === ctx.userId;
  }

  const membership = await ctx.db
    .query("organizationMember")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.ownerId).eq("userId", ctx.userId),
    )
    .filter((q) => q.eq(q.field("revokedAt"), undefined))
    .first();

  return !!membership && (membership.role === "owner" || membership.role === "admin");
}

export async function isProjectOwner(
  ctx: Context & { userId: Id<"user"> },
  project: Doc<"project">,
): Promise<boolean> {
  if (project.ownerType === "user") {
    return project.ownerId === ctx.userId;
  }

  const membership = await ctx.db
    .query("organizationMember")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.ownerId).eq("userId", ctx.userId),
    )
    .filter((q) => q.eq(q.field("revokedAt"), undefined))
    .first();

  return !!membership && membership.role === "owner";
}
