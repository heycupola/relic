import { type AuthFunctions, createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { deviceAuthorization, organization } from "better-auth/plugins";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { Id as BetterAuthId } from "./betterAuth/_generated/dataModel";
import authSchema from "./betterAuth/schema";
import { ac, admin, member, owner, viewer } from "./lib/permissions";

const siteUrl = process.env.SITE_URL || "";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: {
    schema: authSchema,
  },
  authFunctions,
  triggers: {
    invitation: {},
    organization: {
      // when a new org created, add owner as a member
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
        freeOrganizationUsed: {
          type: "boolean",
          input: true,
          required: true,
          defaultValue: false,
        },
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
    plugins: [
      convex(),
      deviceAuthorization({
        expiresIn: "30m",
        interval: "5s",
      }),
      organization({
        allowUserToCreateOrganization: async (user) => {
          const existingUser = await ctx.runQuery(components.betterAuth.user.loadUserById, {
            userId: user.id as BetterAuthId<"user">,
          });

          return existingUser.hasPro;
        },
        creatorRole: "owner",
        ac,
        roles: {
          owner,
          admin,
          member,
          viewer,
        },
        schema: {
          organization: {
            modelName: "organization",
            additionalFields: {
              isFreeWithProPlan: {
                type: "boolean",
                input: true,
                required: true,
              },
              currentKeyVersion: {
                type: "number",
                input: true,
                required: true,
                defaultValue: 1,
              },
              subscriptionStatus: {
                type: "string", // active, pending, payment_lapsed, suspended
                input: true,
                required: true,
              },
              paymentExpiresAt: {
                type: "number",
                input: true,
                required: false,
              },
              deletedAt: {
                type: "number",
                input: true,
                required: false,
              },
              paymentLapsedAt: {
                type: "number",
                input: true,
                required: false,
              },
              suspendedAt: {
                type: "number",
                input: true,
                required: false,
              },
            },
          },
          invitation: {
            additionalFields: {
              role: {
                type: "string",
                input: true,
                required: true,
              },
            },
          },
          member: {
            modelName: "member",
            additionalFields: {
              wrappedOrgKey: {
                type: "string",
                input: true,
                required: false,
              },
              keyVersion: {
                type: "number",
                input: true,
                required: false,
              },
              grantedBy: {
                type: "string",
                input: true,
                required: true,
              },
              revokedAt: {
                type: "number",
                input: true,
                required: false,
              },
              revokedBy: {
                type: "string",
                input: true,
                required: false,
              },
              revocationReason: {
                type: "string",
                input: true,
                required: false,
              },
              isPending: {
                type: "boolean",
                input: true,
                required: true,
              },
            },
          },
        },
      }),
    ],
  });
};
