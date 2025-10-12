import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";

export const protectedQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const userId = identity.subject;

    return {
      ctx: { userId },
      args: {},
    };
  },
});

export const protectedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Unauthorized - Please sign in");
    }

    const userId = identity.subject;

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
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? identity.subject : null;

    return {
      ctx: { userId },
      args: {},
    };
  },
});

export const optionalMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? identity.subject : null;

    return {
      ctx: { userId },
      args: {},
    };
  },
});
