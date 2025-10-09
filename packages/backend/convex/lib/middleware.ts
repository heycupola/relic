import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import { authComponent } from "../auth";

export const protectedQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args) => {
    const user = await authComponent.getAuthUser(ctx);

    if (!user) {
      throw new Error("Unauthorized - Please sign in");
    }

    return {
      ctx: { user, userId: user.userId },
      args: {},
    };
  },
});

export const protectedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args) => {
    const user = await authComponent.getAuthUser(ctx);

    if (!user) {
      throw new Error("Unauthorized - Please sign in");
    }

    return {
      ctx: { user, userId: user.userId },
      args: {},
    };
  },
});

export const publicQuery = query;
export const publicMutation = mutation;

export const optionalQuery = customQuery(query, {
  args: {},
  input: async (ctx, _args) => {
    const user = await authComponent.getAuthUser(ctx);

    return {
      ctx: { user, userId: user.userId },
      args: {},
    };
  },
});

export const optionalMutation = customMutation(mutation, {
  args: {},
  input: async (ctx, _args) => {
    const user = await authComponent.getAuthUser(ctx);

    return {
      ctx: { user, userId: user.userId },
      args: {},
    };
  },
});
