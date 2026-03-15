import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleWebhookEvent, type StripeEvent, verifyStripeSignature } from "../convex/stripe";

function makeEvent(overrides: Partial<StripeEvent> & { type: string }): StripeEvent {
  return {
    id: `evt_${Date.now()}`,
    data: {
      object: {
        id: "sub_1",
        metadata: { userId: "test-user-id" },
        status: "active",
        items: {
          data: [{ price: { id: process.env.STRIPE_PRO_PRICE_ID || "price_pro" } }],
        },
      },
    },
    ...overrides,
  };
}

describe("handleWebhookEvent", () => {
  let scheduler: { runAfter: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    scheduler = { runAfter: vi.fn() };
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
  });

  test("subscription.created with active Pro triggers upgrade", async () => {
    const event = makeEvent({ type: "customer.subscription.created" });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [delay, ref, args] = scheduler.runAfter.mock.calls[0];
    expect(delay).toBe(0);
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test("subscription.updated with inactive status triggers downgrade", async () => {
    const event = makeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          metadata: { userId: "test-user-id" },
          status: "canceled",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [, , args] = scheduler.runAfter.mock.calls[0];
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test("subscription.updated with non-Pro price triggers downgrade", async () => {
    const event = makeEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          metadata: { userId: "test-user-id" },
          status: "active",
          items: { data: [{ price: { id: "price_basic" } }] },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
  });

  test("subscription.deleted triggers downgrade", async () => {
    const event = makeEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_1",
          metadata: { userId: "test-user-id" },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [, , args] = scheduler.runAfter.mock.calls[0];
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test("checkout.session.completed triggers upgrade", async () => {
    const event = makeEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          metadata: { userId: "test-user-id" },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [delay, , args] = scheduler.runAfter.mock.calls[0];
    expect(delay).toBe(0);
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test("invoice.payment_failed does not schedule anything", async () => {
    const event = makeEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "inv_1",
          metadata: { userId: "test-user-id" },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("event with missing userId skips processing", async () => {
    const event = makeEvent({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          metadata: {},
          status: "active",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("event with no metadata skips processing", async () => {
    const event: StripeEvent = {
      id: "evt_1",
      type: "customer.subscription.created",
      data: { object: { id: "sub_1" } },
    };
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("unhandled event type does not schedule anything", async () => {
    const event = makeEvent({ type: "charge.succeeded" });
    await handleWebhookEvent({ scheduler } as any, event);

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret";

  async function signPayload(payload: string, timestampSeconds: number): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signedPayload = `${timestampSeconds}.${payload}`;
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const sigHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `t=${timestampSeconds},v1=${sigHex}`;
  }

  test("valid signature with recent timestamp returns true", async () => {
    const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
    const ts = Math.floor(Date.now() / 1000);
    const signature = await signPayload(payload, ts);

    expect(await verifyStripeSignature(payload, signature, secret)).toBe(true);
  });

  test("expired timestamp returns false", async () => {
    const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
    const ts = Math.floor(Date.now() / 1000) - 600;
    const signature = await signPayload(payload, ts);

    expect(await verifyStripeSignature(payload, signature, secret)).toBe(false);
  });

  test("invalid signature returns false", async () => {
    const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
    const ts = Math.floor(Date.now() / 1000);
    const signature = `t=${ts},v1=deadbeef`;

    expect(await verifyStripeSignature(payload, signature, secret)).toBe(false);
  });

  test("missing timestamp returns false", async () => {
    expect(await verifyStripeSignature("{}", "v1=abc123", secret)).toBe(false);
  });

  test("missing v1 signature returns false", async () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(await verifyStripeSignature("{}", `t=${ts}`, secret)).toBe(false);
  });
});
