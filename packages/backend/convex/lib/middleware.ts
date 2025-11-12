import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { action, mutation, query } from "../_generated/server";

export const protectedQuery = customQuery(query, {
  args: {},
  input: async (
    ctx: QueryCtx,
    _args: Record<string, never>,
  ): Promise<{
    ctx: {
      userId: Id<"user">;
      authId: string;
      name: string | undefined;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const authId = identity.subject;
    const name = identity.name;
    const email = identity.email;

    const existingUser = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .first();

    if (!existingUser) {
      throw new Error("User not found. Please complete registration.");
    }

    return {
      ctx: { userId: existingUser._id, authId, name, email },
      args: {},
    };
  },
});

export const protectedMutation = customMutation(mutation, {
  args: {},
  input: async (
    ctx: MutationCtx,
    _args: Record<string, never>,
  ): Promise<{
    ctx: {
      userId: Id<"user">;
      authId: string;
      name: string | undefined;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const authId = identity.subject;
    const email = identity.email as string;
    const name = identity.name as string | undefined;

    const existingUser = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .first();

    if (!existingUser) {
      throw new Error("User not found. Please complete registration.");
    }

    const updates: {
      email?: string;
      name?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (existingUser.email !== email) updates.email = email;
    if (name && existingUser.name !== name) updates.name = name;

    if (Object.keys(updates).length > 1) {
      await ctx.db.patch(existingUser._id, updates);
    }

    return {
      ctx: { userId: existingUser._id, authId, name, email },
      args: {},
    };
  },
});

export const protectedAction = customAction(action, {
  args: {},
  input: async (
    ctx: ActionCtx,
    _args: Record<string, never>,
  ): Promise<{
    ctx: {
      userId: Id<"user">;
      authId: string;
      name: string | undefined;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    type InternalUser = {
      _id: Id<"user">;
      _creationTime: number;
      name?: string | undefined;
      planDowngradedAt?: number | undefined;
      authId: string;
      email: string;
      freeOrganizationUsed: boolean;
      createdAt: number;
      updatedAt: number;
    };

    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const authId = identity.subject;
    const email = identity.email as string;
    const name = identity.name as string | undefined;

    let existingUser: InternalUser | null;
    try {
      existingUser = await ctx.runQuery(internal.user.getUserByAuthId, { authId });
    } catch (_error) {
      existingUser = null;
    }

    if (!existingUser) {
      throw new Error("User not found. Please complete registration.");
    }

    const updates: {
      email?: string;
      name?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (existingUser.email !== email) updates.email = email;
    if (name && existingUser.name !== name) updates.name = name;

    if (Object.keys(updates).length > 1) {
      await ctx.runMutation(internal.user.updateUser, { userId: existingUser._id, updates });
    }

    return {
      ctx: { userId: existingUser._id, authId, name, email },
      args: {},
    };
  },
});

export const publicQuery = query;
export const publicMutation = mutation;
