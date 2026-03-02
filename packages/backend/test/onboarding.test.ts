import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { ErrorCode } from "../convex/lib/errors.ts";
import schema from "../convex/schema";
import {
  betterAuthModules,
  expectConvexError,
  getTestUsers,
  mockAutumn,
  modules,
  type TestUser,
} from "./setup";

describe("Onboarding", () => {
  let t: TestConvex<typeof schema>;
  let testUsers: TestUser[] = [];
  let owner: TestUser;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    const betterAuthSchema = await import("../convex/betterAuth/generatedSchema.ts");
    t.registerComponent("betterAuth", betterAuthSchema.default, betterAuthModules);

    testUsers = await getTestUsers(t);
    owner = testUsers[0]!;
  });

  afterEach(() => {
    mockAutumn.reset();
  });

  test("should complete onboarding once and persist metadata", async () => {
    const rowsBefore = await t.run(async (ctx) => {
      return await ctx.db
        .query("onboarding")
        .withIndex("by_user", (q) => q.eq("userId", owner.userId))
        .collect();
    });
    expect(rowsBefore).toHaveLength(0);

    const result = await owner.asUser.mutation(api.user.completeOnboarding, {
      source: "github",
      sourceOther: "friend told me",
      teamSize: "2-5",
    });
    expect(result).toEqual({ success: true });

    const userAfter = await owner.asUser.query(api.user.getCurrentUser, {});
    expect(userAfter.hasCompletedOnboarding).toBe(true);

    const rowsAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("onboarding")
        .withIndex("by_user", (q) => q.eq("userId", owner.userId))
        .collect();
    });
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0]?.source).toBe("github");
    expect(rowsAfter[0]?.sourceOther).toBe("friend told me");
    expect(rowsAfter[0]?.teamSize).toBe("2-5");
    expect(typeof rowsAfter[0]?.createdAt).toBe("number");

    await expectConvexError(
      () =>
        owner.asUser.mutation(api.user.completeOnboarding, {
          source: "x",
          teamSize: "1",
        }),
      ErrorCode.UNABLE_TO_PERFORM_THIS_ACTION,
    );
  });
});
