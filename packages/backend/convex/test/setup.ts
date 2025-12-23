/// <reference types="vite/client" />

import type { UserIdentity } from "convex/server";
import type { convexTest } from "convex-test";
import { vi } from "vitest";
import { components } from "../_generated/api";
import type { Id as BetterAuthId } from "../betterAuth/_generated/dataModel";
import { createMockAutumn } from "./helpers/autumn.mock";
import {
  createUserKeys,
  decryptPrivateKeyWithPassword,
  deriveKeyFromPassword,
} from "./helpers/crypto";

export const modules = import.meta.glob("../**/*.ts", {
  eager: false,
});

export const betterAuthModules = import.meta.glob("../betterAuth/**/*.ts", {
  eager: false,
});

vi.mock("../rateLimiter", () => ({
  rateLimiter: {
    limit: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    check: vi.fn(() => Promise.resolve({ ok: true, retryAfter: 0 })),
    reset: vi.fn(() => Promise.resolve(undefined)),
  },
}));

vi.mock("@convex-dev/rate-limiter/convex.config", () => ({
  default: {},
}));

const identifyFn = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return {
    customerId: identity.subject,
    customerData: {
      name: identity.name,
      email: identity.email,
    },
  };
};

export const mockAutumn = createMockAutumn(identifyFn);

vi.mock("../autumn", () => ({
  autumn: mockAutumn,
  initAutumn: () => mockAutumn,
}));

export interface TestUser {
  userId: BetterAuthId<"user">;
  email: string;
  asUser: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;
  publicKey?: string;
  privateKey?: CryptoKey;
  encryptedPrivateKey?: string;
  salt?: string;
  password?: string;
  masterKey?: CryptoKey;
}

function randomString(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const createTestUser = async (
  t: ReturnType<typeof convexTest>,
  args: {
    hasKeys: boolean;
  },
): Promise<TestUser> => {
  const name = "name".concat(randomString());
  const email = name.concat("@relic.so");

  const now = Date.now();
  const userId = await t.run(async (ctx) => {
    const result = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          email,
          name,
          createdAt: now,
          updatedAt: now,
          hasPro: false,
          emailVerified: true,
        },
      },
    });

    type WithId = { _id?: string; id?: string };

    const id =
      typeof result === "string"
        ? result
        : ((result as WithId)._id ?? (result as WithId).id ?? result);

    return id as BetterAuthId<"user">;
  });

  const asUser = t.withIdentity({
    subject: userId,
    email,
    name,
  });

  if (args.hasKeys) {
    const password = "password".concat(randomString());

    const { encryptedPrivateKey, publicKey, salt } = await createUserKeys(password);

    await asUser.mutation(components.betterAuth.user.setKeysAndSalt, {
      userId,
      publicKey,
      encryptedPrivateKey,
      salt,
    });

    const masterKey = await deriveKeyFromPassword(password, salt);
    const privateKey = await decryptPrivateKeyWithPassword(encryptedPrivateKey, password, salt);

    return {
      asUser,
      email,
      userId,
      encryptedPrivateKey,
      password,
      masterKey,
      publicKey,
      salt,
      privateKey,
    };
  } else {
    return {
      asUser,
      email,
      userId,
    };
  }
};

export async function getTestUsers(t: ReturnType<typeof convexTest>): Promise<TestUser[]> {
  const testUsers: TestUser[] = [];

  for (let i = 0; i < 10; i++) {
    const user = await createTestUser(t, { hasKeys: true });

    testUsers.push(user);
  }

  return testUsers;
}
