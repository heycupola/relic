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

    // Look up user by authId
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
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const authId = identity.subject;
    const email = identity.email as string;
    const name = identity.name as string | undefined;
    const avatarUrl = identity.pictureUrl as string | undefined;

    // Sync user from auth
    const existingUser = await ctx.db
      .query("user")
      .withIndex("by_auth_id", (q) => q.eq("authId", authId))
      .first();

    let userId: Id<"user">;

    if (existingUser) {
      // Update if changed
      const updates: {
        email?: string;
        name?: string;
        avatarUrl?: string;
        updatedAt: number;
      } = {
        updatedAt: Date.now(),
      };

      if (existingUser.email !== email) updates.email = email;
      if (name && existingUser.name !== name) updates.name = name;
      if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
        updates.avatarUrl = avatarUrl;
      }

      if (Object.keys(updates).length > 1) {
        await ctx.db.patch(existingUser._id, updates);
      }

      userId = existingUser._id;
    } else {
      // Create new user
      const now = Date.now();
      userId = await ctx.db.insert("user", {
        authId,
        email,
        name,
        avatarUrl,
        freeOrganizationUsed: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      ctx: { userId },
      args: {},
    };
  },
});

export const publicQuery = query;
export const publicMutation = mutation;

export const optionalQuery = customQuery(query, {
  args: {},
  input: async (
    ctx: QueryCtx,
    _args: Record<string, never>,
  ): Promise<{ ctx: { userId: Id<"user"> | null }; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();

    let userId: Id<"user"> | null = null;
    if (identity) {
      const authId = identity.subject;

      const existingUser = await ctx.db
        .query("user")
        .withIndex("by_auth_id", (q) => q.eq("authId", authId))
        .first();

      if (existingUser) {
        userId = existingUser._id;
      }
    }

    return {
      ctx: { userId },
      args: {},
    };
  },
});

export const optionalMutation = customMutation(mutation, {
  args: {},
  input: async (
    ctx: MutationCtx,
    _args: Record<string, never>,
  ): Promise<{ ctx: { userId: Id<"user"> | null }; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();

    let userId: Id<"user"> | null = null;
    if (identity) {
      const authId = identity.subject;
      const email = identity.email as string;
      const name = identity.name as string | undefined;
      const avatarUrl = identity.pictureUrl as string | undefined;

      const existingUser = await ctx.db
        .query("user")
        .withIndex("by_auth_id", (q) => q.eq("authId", authId))
        .first();

      if (existingUser) {
        const updates: {
          email?: string;
          name?: string;
          avatarUrl?: string;
          updatedAt: number;
        } = {
          updatedAt: Date.now(),
        };

        if (existingUser.email !== email) updates.email = email;
        if (name && existingUser.name !== name) updates.name = name;
        if (avatarUrl && existingUser.avatarUrl !== avatarUrl) {
          updates.avatarUrl = avatarUrl;
        }

        if (Object.keys(updates).length > 1) {
          await ctx.db.patch(existingUser._id, updates);
        }

        userId = existingUser._id;
      } else {
        const now = Date.now();
        userId = await ctx.db.insert("user", {
          authId,
          email,
          name,
          avatarUrl,
          freeOrganizationUsed: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return {
      ctx: { userId },
      args: {},
    };
  },
});
