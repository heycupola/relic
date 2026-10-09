import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { deviceAuthorization, lastLoginMethod } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { getSiteUrl } from "./lib/site";

const SITE_URL = getSiteUrl();

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        await ctx.scheduler.runAfter(0, internal.user._sendWelcomeEmail, {
          userId: doc._id,
        });
      },
    },
  },
}) as ReturnType<typeof createClient<DataModel>>;

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    user: {
      modelName: "user",
      additionalFields: {
        hasPro: {
          type: "boolean",
          input: true,
          required: true,
          defaultValue: false,
        },
        planDowngradedAt: {
          type: "number",
          input: true,
          required: false,
        },
        gracePeriodEmailSent: {
          type: "boolean",
          input: true,
          required: false,
        },
        accessRestrictedEmailSent: {
          type: "boolean",
          input: true,
          required: false,
        },
        publicKey: {
          type: "string",
          input: true,
          required: false,
        },
        encryptedPrivateKey: {
          type: "string",
          input: true,
          required: false,
        },
        salt: {
          type: "string",
          input: true,
          required: false,
        },
        keysUpdatedAt: {
          type: "date",
          input: true,
          required: false,
        },
        hasCompletedOnboarding: {
          type: "boolean",
          input: true,
          required: false,
          defaultValue: false,
        },
      },
    },
    baseURL: SITE_URL,
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        prompt: "select_account",
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
    plugins: [convex({ authConfig }), deviceAuthorization(), lastLoginMethod()],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
