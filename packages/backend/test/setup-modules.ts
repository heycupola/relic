/// <reference types="vite/client" />

/**
 * Minimal module providing `modules` and `mockAutumn` with ZERO convex imports.
 * Split from setup.ts to prevent circular import / TDZ "Cannot access before initialization".
 * Import this file for convexTest(schema, modules) and mockAutumn - it has no dependencies
 * that could pull in convex or trigger vi.mock resolution during initialization.
 */
export const modules = import.meta.glob([
  "../convex/**/*.ts",
  "!../convex/betterAuth/**",
  "!../convex/rateLimiter.ts",
  "!../convex/lib/rateLimit.ts",
]);
export const betterAuthModules = import.meta.glob("../convex/betterAuth/**/*.ts");

// Get the mock autumn from globalThis (set by vitest.setup.ts)
// biome-ignore lint/suspicious/noExplicitAny: Test mock accessed via globalThis
export const mockAutumn = (globalThis as any).__mockAutumn;
