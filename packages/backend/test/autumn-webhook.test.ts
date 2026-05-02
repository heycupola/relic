import { beforeEach, describe, expect, test, vi } from "vitest";
import { type AutumnWebhookEvent, handleAutumnWebhookEvent } from "../convex/autumnWebhook";
import { verifySvixSignature } from "../convex/lib/svix";

function makeEvent(
  scenario: NonNullable<AutumnWebhookEvent["data"]>["scenario"],
  overrides: Partial<AutumnWebhookEvent> = {},
): AutumnWebhookEvent {
  return {
    type: "customer.products.updated",
    data: {
      scenario,
      customer: {
        id: "test-user-id",
        email: "test@example.com",
      },
      updated_product: {
        id: "pro_plan",
        name: "Pro Plan",
      },
    },
    ...overrides,
  };
}

describe("handleAutumnWebhookEvent", () => {
  let scheduler: { runAfter: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    scheduler = { runAfter: vi.fn() };
  });

  test("new Pro plan event triggers an upgrade", async () => {
    await handleAutumnWebhookEvent({ scheduler } as any, makeEvent("new"));

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [delay, , args] = scheduler.runAfter.mock.calls[0];
    expect(delay).toBe(0);
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test("upgrade Pro plan event triggers an upgrade", async () => {
    await handleAutumnWebhookEvent({ scheduler } as any, makeEvent("upgrade"));

    expect(scheduler.runAfter).toHaveBeenCalledOnce();
    const [, , args] = scheduler.runAfter.mock.calls[0];
    expect(args).toEqual({ userId: "test-user-id" });
  });

  test.each(["downgrade", "cancel", "expired", "past_due"] as const)(
    "%s Pro plan event triggers a downgrade",
    async (scenario) => {
      await handleAutumnWebhookEvent({ scheduler } as any, makeEvent(scenario));

      expect(scheduler.runAfter).toHaveBeenCalledOnce();
      const [delay, , args] = scheduler.runAfter.mock.calls[0];
      expect(delay).toBe(0);
      expect(args).toEqual({ userId: "test-user-id" });
    },
  );

  test.each(["scheduled", "renew"] as const)(
    "%s Pro plan event does not change local plan state",
    async (scenario) => {
      await handleAutumnWebhookEvent({ scheduler } as any, makeEvent(scenario));

      expect(scheduler.runAfter).not.toHaveBeenCalled();
    },
  );

  test("non-Pro product event is ignored", async () => {
    await handleAutumnWebhookEvent(
      { scheduler } as any,
      makeEvent("cancel", {
        data: {
          scenario: "cancel",
          customer: { id: "test-user-id" },
          updated_product: { id: "enterprise_plan" },
        },
      }),
    );

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });

  test("missing customer ID rejects the webhook", async () => {
    await expect(
      handleAutumnWebhookEvent(
        { scheduler } as any,
        makeEvent("cancel", {
          data: {
            scenario: "cancel",
            customer: {},
            updated_product: { id: "pro_plan" },
          },
        }),
      ),
    ).rejects.toThrow("Autumn webhook is missing a valid customer ID");
  });

  test("unhandled event type is ignored", async () => {
    await handleAutumnWebhookEvent({ scheduler } as any, {
      type: "balances.limit_reached",
      data: {},
    });

    expect(scheduler.runAfter).not.toHaveBeenCalled();
  });
});

describe("verifySvixSignature", () => {
  const secretBytes = new TextEncoder().encode("test_secret");
  const secret = `whsec_${btoa(String.fromCharCode(...Array.from(secretBytes)))}`;

  async function signPayload(payload: string, svixId: string, timestampSeconds: number) {
    const secretBuffer = new ArrayBuffer(secretBytes.length);
    new Uint8Array(secretBuffer).set(secretBytes);
    const key = await crypto.subtle.importKey(
      "raw",
      secretBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signedContent = `${svixId}.${timestampSeconds}.${payload}`;
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedContent),
    );
    const signatureArray = new Uint8Array(signatureBytes);
    return `v1,${btoa(String.fromCharCode(...Array.from(signatureArray)))}`;
  }

  test("valid signature with recent timestamp returns true", async () => {
    const payload = '{"type":"customer.products.updated"}';
    const svixId = "msg_123";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signPayload(payload, svixId, timestamp);

    expect(
      await verifySvixSignature(
        payload,
        {
          "svix-id": svixId,
          "svix-timestamp": String(timestamp),
          "svix-signature": signature,
        },
        secret,
      ),
    ).toBe(true);
  });

  test("expired timestamp returns false", async () => {
    const payload = '{"type":"customer.products.updated"}';
    const svixId = "msg_123";
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = await signPayload(payload, svixId, timestamp);

    expect(
      await verifySvixSignature(
        payload,
        {
          "svix-id": svixId,
          "svix-timestamp": String(timestamp),
          "svix-signature": signature,
        },
        secret,
      ),
    ).toBe(false);
  });

  test("invalid signature returns false", async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    expect(
      await verifySvixSignature(
        "{}",
        {
          "svix-id": "msg_123",
          "svix-timestamp": String(timestamp),
          "svix-signature": "v1,invalid",
        },
        secret,
      ),
    ).toBe(false);
  });

  test("missing headers return false", async () => {
    expect(
      await verifySvixSignature(
        "{}",
        {
          "svix-id": null,
          "svix-timestamp": null,
          "svix-signature": null,
        },
        secret,
      ),
    ).toBe(false);
  });
});
