import { Autumn } from "autumn-js";
import { type BillingFeatureId, PRO_PLAN_ID } from "./plans";
import { getSiteUrl } from "./site";

let client: Autumn | null = null;

function getClient(): Autumn {
  if (!client) {
    const secretKey = process.env.AUTUMN_SECRET_KEY;
    if (!secretKey) {
      throw new Error("AUTUMN_SECRET_KEY is not configured");
    }
    client = new Autumn({ secretKey, timeoutMs: 10_000 });
  }
  return client;
}

export type BillingCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type AutumnSnapshot = {
  hasActivePro: boolean;
  usage: Partial<Record<BillingFeatureId, number>>;
};

export const autumnApi = {
  async getSnapshot(customer: BillingCustomer): Promise<AutumnSnapshot> {
    const result = await getClient().customers.getOrCreate({
      customerId: customer.id,
      name: customer.name ?? undefined,
      email: customer.email ?? undefined,
    });

    const hasActivePro = result.subscriptions.some(
      (s) => s.planId === PRO_PLAN_ID && s.status === "active" && !s.pastDue,
    );

    const usage: AutumnSnapshot["usage"] = {};
    for (const [featureId, balance] of Object.entries(result.balances)) {
      usage[featureId as BillingFeatureId] = balance.usage;
    }

    return { hasActivePro, usage };
  },

  async track(customerId: string, featureId: BillingFeatureId, value: number): Promise<void> {
    await getClient().track({ customerId, featureId, value, async: false });
  },

  /** Returns a hosted checkout URL, or null when Autumn upgraded the customer without one. */
  async createProCheckoutUrl(customer: BillingCustomer): Promise<string | null> {
    await getClient().customers.getOrCreate({
      customerId: customer.id,
      name: customer.name ?? undefined,
      email: customer.email ?? undefined,
    });

    const result = await getClient().billing.attach({
      customerId: customer.id,
      planId: PRO_PLAN_ID,
      successUrl: `${getSiteUrl()}/subscription/success`,
      redirectMode: "if_required",
    });

    return result.paymentUrl;
  },

  async createPortalUrl(customerId: string, returnPath = "/dashboard"): Promise<string> {
    const result = await getClient().billing.openCustomerPortal({
      customerId,
      returnUrl: `${getSiteUrl()}${returnPath}`,
    });
    return result.url;
  },

  async cancelProImmediately(customerId: string): Promise<void> {
    await getClient().billing.update({
      customerId,
      planId: PRO_PLAN_ID,
      cancelAction: "cancel_immediately",
    });
  },
};
