import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret, generateAESKey } from "@repo/crypto";
import type { SecretHistory } from "../types/api";
import { buildHistoryListItems, formatHistoryTime, reEncryptHistoryEntries } from "./history";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function makeHistory(overrides: Partial<SecretHistory> = {}): SecretHistory {
  return {
    secretId: "secret_1",
    key: "API_KEY",
    isDeleted: false,
    currentVersion: 3,
    encryptedValue: "enc-v3",
    updatedByEmail: "alice@example.com",
    updatedAt: NOW,
    versions: [
      {
        id: "h2",
        version: 2,
        key: "API_KEY",
        encryptedValue: "enc-v2",
        valueType: "string",
        scope: "shared",
        changeType: "restored",
        changedBy: "user_2",
        changedByEmail: null,
        changedAt: NOW - HOUR,
      },
      {
        id: "h1",
        version: 1,
        key: "API_KEY",
        encryptedValue: "enc-v1",
        valueType: "string",
        scope: "shared",
        changeType: "updated",
        changedBy: "user_1",
        changedByEmail: "alice@example.com",
        changedAt: NOW - 2 * HOUR,
      },
    ],
    encryptedProjectKey: "pk",
    retentionLimit: 10,
    ...overrides,
  };
}

describe("buildHistoryListItems", () => {
  test("lists the current value first, then previous versions", () => {
    const items = buildHistoryListItems(makeHistory());
    expect(items.map((item) => [item.version, item.label, item.isCurrent])).toEqual([
      [3, "current", true],
      [2, "restored", false],
      [1, "updated", false],
    ]);
    expect(items[1]!.changedBy).toBe("user_2");
  });

  test("has no current row for a deleted secret", () => {
    const items = buildHistoryListItems(
      makeHistory({ isDeleted: true, currentVersion: null, encryptedValue: null }),
    );
    expect(items.map((item) => item.version)).toEqual([2, 1]);
  });
});

describe("formatHistoryTime", () => {
  test("formats relative times", () => {
    expect(formatHistoryTime(NOW - 30_000, NOW)).toBe("just now");
    expect(formatHistoryTime(NOW - 15 * 60_000, NOW)).toBe("15m ago");
    expect(formatHistoryTime(NOW - 5 * HOUR, NOW)).toBe("5h ago");
    expect(formatHistoryTime(NOW - 48 * HOUR, NOW)).toBe("2d ago");
    expect(formatHistoryTime(Date.UTC(2026, 0, 1), NOW)).toBe("2026-01-01");
  });
});

describe("reEncryptHistoryEntries", () => {
  test("re-encrypts entries under the new key", async () => {
    const oldKey = await generateAESKey();
    const newKey = await generateAESKey();
    const entries = [
      { id: "h1", encryptedValue: await encryptSecret(oldKey, "first") },
      { id: "h2", encryptedValue: await encryptSecret(oldKey, "second") },
    ];

    const result = await reEncryptHistoryEntries(entries, oldKey, newKey);

    expect(result.map((entry) => entry.historyId)).toEqual(["h1", "h2"]);
    expect(await decryptSecret(newKey, result[0]!.newEncryptedValue)).toBe("first");
    expect(await decryptSecret(newKey, result[1]!.newEncryptedValue)).toBe("second");
    await expect(decryptSecret(oldKey, result[0]!.newEncryptedValue)).rejects.toThrow();
  });

  test("skips entries that don't decrypt with the current key", async () => {
    const oldKey = await generateAESKey();
    const retiredKey = await generateAESKey();
    const newKey = await generateAESKey();
    const entries = [
      { id: "h1", encryptedValue: await encryptSecret(retiredKey, "stale") },
      { id: "h2", encryptedValue: await encryptSecret(oldKey, "fresh") },
    ];

    const result = await reEncryptHistoryEntries(entries, oldKey, newKey);

    expect(result.map((entry) => entry.historyId)).toEqual(["h2"]);
  });
});
