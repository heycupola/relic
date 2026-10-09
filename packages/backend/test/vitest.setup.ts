/// <reference types="vite/client" />

import { vi } from "vitest";

// Mock rate limiter modules
vi.mock("../convex/rateLimiter", () => ({
  rateLimiter: {
    limit: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    check: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    reset: vi.fn(() => Promise.resolve(undefined)),
  },
}));

vi.mock("../convex/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@convex-dev/rate-limiter/convex.config", () => ({
  default: {},
}));

// Mock Resend SDK
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "mock-email-id" }, error: null }),
    },
  })),
}));

// Mock Resend component
vi.mock("../convex/resend", () => ({
  getResendSdk: vi.fn().mockReturnValue({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "mock-email-id" }, error: null }),
    },
  }),
  resend: {
    sendEmailManually: vi.fn().mockResolvedValue("mock-email-id"),
  },
  sendEmail: vi.fn().mockResolvedValue({ emailId: "mock-email-id" }),
  getUpgradeUrl: vi.fn().mockReturnValue("https://withrelic.com/upgrade"),
  getDashboardUrl: vi.fn().mockReturnValue("https://withrelic.com/dashboard"),
}));

const { _mockBilling } = vi.hoisted(() => {
  type Customer = { hasActivePro: boolean; usage: Record<string, number> };

  class MockBilling {
    customers = new Map<string, Customer>();
    tracked: { customerId: string; featureId: string; value: number }[] = [];

    private customer(id: string): Customer {
      let customer = this.customers.get(id);
      if (!customer) {
        customer = { hasActivePro: false, usage: { projects: 0, additional_shares: 0 } };
        this.customers.set(id, customer);
      }
      return customer;
    }

    setPro(customerId: string, hasActivePro: boolean) {
      this.customer(customerId).hasActivePro = hasActivePro;
    }

    getUsage(customerId: string, featureId: string): number {
      return this.customer(customerId).usage[featureId] ?? 0;
    }

    reset() {
      this.customers.clear();
      this.tracked = [];
    }

    api = {
      getSnapshot: async ({ id }: { id: string }) => {
        const customer = this.customer(id);
        return { hasActivePro: customer.hasActivePro, usage: { ...customer.usage } };
      },
      track: async (customerId: string, featureId: string, value: number) => {
        const customer = this.customer(customerId);
        customer.usage[featureId] = (customer.usage[featureId] ?? 0) + value;
        this.tracked.push({ customerId, featureId, value });
      },
      createProCheckoutUrl: async ({ id }: { id: string }) =>
        `https://checkout.withrelic.com/mock/${id}`,
      createPortalUrl: async (customerId: string) =>
        `https://billing.withrelic.com/mock/${customerId}`,
      cancelProImmediately: async (customerId: string) => {
        this.customer(customerId).hasActivePro = false;
      },
    };
  }

  return { _mockBilling: new MockBilling() };
});

// biome-ignore lint/suspicious/noExplicitAny: Test mock needs to be accessible via globalThis
(globalThis as any).__mockBilling = _mockBilling;

vi.mock("../convex/lib/autumn", () => ({ autumnApi: _mockBilling.api }));
