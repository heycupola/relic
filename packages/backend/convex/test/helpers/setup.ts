import type { UserIdentity } from "convex/server";
import type { convexTest } from "convex-test";
import type { Id } from "../../_generated/dataModel";

export interface TestUserData {
  authId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

type ConvexTestInstance = ReturnType<typeof convexTest>;
type WithIdentityReturn = ReturnType<ConvexTestInstance["withIdentity"]>;

export interface TestUser {
  userId: Id<"user">;
  authId: string;
  email: string;
  asUser: WithIdentityReturn;
}

export async function createTestUser(
  t: ReturnType<typeof convexTest>,
  userData: TestUserData,
): Promise<{ userId: Id<"user">; identity: Partial<UserIdentity> }> {
  const now = Date.now();
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("user", {
      authId: userData.authId,
      email: userData.email,
      name: userData.name,
      avatarUrl: userData.avatarUrl,
      freeOrganizationUsed: false,
      createdAt: now,
      updatedAt: now,
    });
  });

  const identity: Partial<UserIdentity> = {
    subject: userData.authId,
    email: userData.email,
    name: userData.name,
    pictureUrl: userData.avatarUrl,
  };

  return { userId, identity };
}

export async function getTestUsers(t: ReturnType<typeof convexTest>) {
  const authIds = Array.from({ length: 10 }, (_, i) => `user${i + 1}`);

  const testUsersMap = new Map<string, TestUser>();

  await Promise.all(
    authIds.map(async (authId) => {
      const email = `${authId}@example.com`;
      const { userId, identity } = await createTestUser(t, { authId, email });

      testUsersMap.set(authId, {
        authId,
        email,
        asUser: t.withIdentity(identity),
        userId,
      });
    }),
  );

  return testUsersMap;
}
