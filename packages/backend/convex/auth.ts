import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { autumn } from "autumn-js/better-auth";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient(components.betterAuth);

export const createAuth = (ctx: GenericCtx, { optionsOnly } = { optionsOnly: false }) => {
  return betterAuth({
    // disable logging when createAuth is called just to generate options.
    // this is not required, but there's a lot of noise in logs without it.
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
    },
    plugins: [
      autumn({
        customerScope: "user_and_organization",
        identify: async ({ session: sessionPromise, organization }) => {
          if (organization) {
            return {
              customerId: organization.id,
              customerData: {
                name: organization.name,
                email: organization.ownerEmail ?? undefined,
              },
            };
          }

          const session = await sessionPromise;

          if (!session) {
            return null;
          }

          return {
            customerId: session.user.id,
            customerData: {
              name: session.user.name,
              email: session.user.email ?? undefined,
            },
          };
        },
      }),
      convex(),
    ],
  });
};
