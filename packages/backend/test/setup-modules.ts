/// <reference types="vite/client" />

/**
 * Minimal module providing `modules` and `mockBilling` with ZERO convex imports.
 * Split from setup.ts to prevent circular import / TDZ "Cannot access before initialization".
 * Import this file for convexTest(schema, modules) and mockBilling - it has no dependencies
 * that could pull in convex or trigger vi.mock resolution during initialization.
 */
export const modules = import.meta.glob([
  "../convex/**/*.ts",
  "!../convex/betterAuth/**",
  "!../convex/rateLimiter.ts",
  "!../convex/lib/rateLimit.ts",
]);
export const betterAuthModules = import.meta.glob("../convex/betterAuth/**/*.ts");

export type MockBilling = {
  setPro(customerId: string, hasActivePro: boolean): void;
  getUsage(customerId: string, featureId: string): number;
  reset(): void;
  tracked: { customerId: string; featureId: string; value: number }[];
};

// biome-ignore lint/suspicious/noExplicitAny: Test mock accessed via globalThis
export const mockBilling: MockBilling = (globalThis as any).__mockBilling;
