import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL || "";

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
          userId: doc._id as BetterAuthId<"user">,
        });
      },
    },
  },
}) as ReturnType<typeof createClient<DataModel>>;

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
): ReturnType<typeof betterAuth> => {
  return betterAuth({
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
      },
    },
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
    plugins: [convex(), deviceAuthorization()],
  });
};
