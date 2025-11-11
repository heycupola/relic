import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

const siteUrl = process.env.SITE_URL || "";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        const existingUser = await ctx.db
          .query("user")
          .withIndex("by_auth_id", (q) => q.eq("authId", authUser._id))
          .first();

        if (!existingUser) {
          console.log("✨ Creating new user in app database:", authUser.email);
          const now = Date.now();
          await ctx.db.insert("user", {
            authId: authUser._id,
            email: authUser.email,
            name: authUser.name ?? undefined,
            freeOrganizationUsed: false,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          console.log("⚠️ User already exists in app database:", authUser.email);
        }
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
    plugins: [convex()],
  });
};
