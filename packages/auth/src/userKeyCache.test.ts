import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  type CachedUserKeys,
  cacheUserKeys,
  clearCachedUserKeys,
  getCachedUserKeys,
  initializeSchema,
} from "./userKeyCache";

function createTestDb(): Database {
  const db = new Database(":memory:");
  initializeSchema(db);
  return db;
}

describe("userKeyCache", () => {
  let db: Database;
  const KEYS_UPDATE_TIME_FIXTURE = Date.now();
  const USER_KEYS_FIXTURE = {
    encryptedPrivateKey: "enc_priv_12345",
    keysUpdatedAt: KEYS_UPDATE_TIME_FIXTURE,
    salt: "salt_12345",
  } satisfies CachedUserKeys;

  beforeEach(() => {
    db = createTestDb();
  });

  test("it caches user keys successfully", () => {
    cacheUserKeys(db, USER_KEYS_FIXTURE);

    const cachedUserKeys = getCachedUserKeys(db);

    expect(cachedUserKeys).not.toBeNull();

    if (cachedUserKeys !== null) {
      expect(cachedUserKeys.encryptedPrivateKey).toBe(USER_KEYS_FIXTURE.encryptedPrivateKey);
      expect(cachedUserKeys.keysUpdatedAt).toBe(KEYS_UPDATE_TIME_FIXTURE);
      expect(cachedUserKeys.salt).toBe(USER_KEYS_FIXTURE.salt);
    }
  });

  test("it clears cached user keys", () => {
    cacheUserKeys(db, USER_KEYS_FIXTURE);

    clearCachedUserKeys(db);

    const cachedUserKeys = getCachedUserKeys(db);

    expect(cachedUserKeys).toBeNull();
  });
});
