/// <reference types="vite/client" />

import { ConvexError } from "convex/values";
import type { convexTest } from "convex-test";
import { expect } from "vitest";
import { components } from "../convex/_generated/api";
import type { Id as BetterAuthId } from "../convex/betterAuth/_generated/dataModel";
import type { ErrorCode } from "../convex/lib/errors";
import {
  createUserKeys,
  decryptPrivateKeyWithPassword,
  deriveKeyFromPassword,
} from "./helpers/crypto";

export const modules = import.meta.glob([
  "../convex/**/*.ts",
  "!../convex/betterAuth/**",
  "!../convex/rateLimiter.ts",
  "!../convex/lib/rateLimit.ts",
]);
export const betterAuthModules = import.meta.glob("../convex/betterAuth/**/*.ts");

// Get the mock autumn from globalThis (set by vitest.setup.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockAutumn = (globalThis as any).__mockAutumn;

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

export function randomString(length = 6) {
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

export const expectConvexError = async (
  fn: () => Promise<unknown>,
  expectedCode: ErrorCode,
  expectedMessage?: string,
) => {
  try {
    await fn();
    throw new Error("Expected ConvexError to be thrown");
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);

    if (err instanceof ConvexError) {
      // Handle double-encoded JSON from component errors
      // This can happen when errors propagate through component boundaries
      let errorData = err.data;
      while (typeof errorData === "string") {
        try {
          errorData = JSON.parse(errorData);
        } catch {
          break;
        }
      }

      expect(errorData.code).toBe(expectedCode);

      if (expectedMessage) {
        expect(errorData.message).toContain(expectedMessage);
      }
    }
  }
};
