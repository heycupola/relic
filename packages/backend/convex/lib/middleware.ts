import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";

export const protectedQuery = customQuery(query, {
  args: {},
  input: async (
    ctx: QueryCtx,
    _args: Record<string, never>,
  ): Promise<{ ctx: { userId: Id<"user"> }; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const authId = identity.subject;

    const existingUser = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .first();

    if (!existingUser) {
      throw new Error("User not found. Please complete registration.");
    }

    return {
      ctx: { userId: existingUser._id },
      args: {},
    };
  },
});

export const protectedMutation = customMutation(mutation, {
  args: {},
  input: async (
    ctx: MutationCtx,
    _args: Record<string, never>,
  ): Promise<{ ctx: { userId: Id<"user"> }; args: Record<string, never> }> => {
    // DEBUG: Log what's available in ctx.auth
    console.log("DEBUG ctx.auth keys:", Object.keys(ctx.auth));
    console.log("DEBUG ctx.auth:", JSON.stringify(ctx.auth, null, 2));

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
      ctx: { userId: existingUser._id },
      args: {},
    };
  },
});

export const publicQuery = query;
export const publicMutation = mutation;
