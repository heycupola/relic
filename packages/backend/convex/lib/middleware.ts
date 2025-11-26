import type { Autumn } from "@useautumn/convex";
import { ConvexError } from "convex/values";
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { action, mutation, query } from "../_generated/server";
import { initAutumn } from "../autumn";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { ErrorSeverity } from "./types";

export const protectedQuery = customQuery(query, {
  args: {},
  input: async (
    ctx: QueryCtx,
    _args: Record<string, never>,
  ): Promise<{
    ctx: {
      userId: BetterAuthId<"user">;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Please sign in",
        severity: ErrorSeverity.Low,
      });
    }

    return {
      ctx: {
        userId: identity.subject as BetterAuthId<"user">,
        email: identity.email,
      },
      args: {},
    };
  },
});

export const protectedMutation = customMutation(mutation, {
  args: {},
  input: async (
    ctx: QueryCtx,
    _args: Record<string, never>,
  ): Promise<{
    ctx: {
      userId: BetterAuthId<"user">;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Please sign in",
        severity: ErrorSeverity.Low,
      });
    }

    return {
      ctx: {
        userId: identity.subject as BetterAuthId<"user">,
        email: identity.email,
      },
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
      autumn: Autumn;
      userId: BetterAuthId<"user">;
      email: string | undefined;
    };
    args: Record<string, never>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "Please sign in",
        severity: ErrorSeverity.Low,
      });
    }

    const autumn = initAutumn({
      customerId: identity.subject,
      customerData: {
        email: identity.email,
        name: identity.name,
      },
    });

    return {
      ctx: {
        autumn,
        userId: identity.subject as BetterAuthId<"user">,
        email: identity.email,
      },
      args: {},
    };
  },
});

export const publicQuery = query;
export const publicMutation = mutation;
