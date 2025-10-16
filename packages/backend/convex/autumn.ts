import { Autumn } from "@useautumn/convex";
import type { GenericActionCtx } from "convex/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

type AutumnContext = GenericActionCtx<DataModel>;

export const autumn = new Autumn(components.autumn, {
  secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
  identify: async (ctx: AutumnContext) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    return {
      customerId: userId,
      customerData: {
        name: identity.name as string,
        email: identity.email as string,
      },
    };
  },
});
