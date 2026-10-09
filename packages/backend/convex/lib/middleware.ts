import type { Auth } from "convex/server";
import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { action, mutation, query } from "../_generated/server";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { createError, ErrorCode } from "./errors";
import { ErrorSeverity } from "./types";

export type Identity = {
  userId: BetterAuthId<"user">;
  email: string | undefined;
  name: string | undefined;
};

async function requireIdentity(ctx: { auth: Auth }): Promise<{ ctx: Identity; args: {} }> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    createError({
      code: ErrorCode.UNAUTHORIZED,
      message: "Please sign in",
      severity: ErrorSeverity.Low,
    });
  }

  return {
    ctx: {
      userId: identity.subject as BetterAuthId<"user">,
      email: identity.email,
      name: identity.name,
    },
    args: {},
  };
}

const authenticated = { args: {}, input: requireIdentity };

export const protectedQuery = customQuery(query, authenticated);
export const protectedMutation = customMutation(mutation, authenticated);
export const protectedAction = customAction(action, authenticated);

export const publicQuery = query;
export const publicMutation = mutation;
