import { describe, expect, test } from "bun:test";
import type { SecretHistory } from "./api";
import {
  buildHistoryRows,
  formatRelativeTime,
  MASKED_VALUE,
  parseVersion,
  renderHistoryTable,
  toHistoryJson,
} from "./history";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function makeHistory(overrides: Partial<SecretHistory["secret"]> = {}): SecretHistory {
  return {
    secret: {
      id: "secret_1",
      key: "API_KEY",
      isDeleted: false,
      currentVersion: 3,
      encryptedValue: "enc-v3",
      valueType: "string",
      scope: "shared",
      updatedBy: "user_1",
      updatedByEmail: "alice@example.com",
      updatedAt: NOW - HOUR,
      ...overrides,
    },
    versions: [
      {
        id: "h2",
        version: 2,
        key: "API_KEY",
        encryptedValue: "enc-v2",
        valueType: "string",
        scope: "shared",
        changeType: "updated",
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
        changeType: "restored",
        changedBy: "user_1",
        changedByEmail: "alice@example.com",
        changedAt: NOW - 3 * 24 * HOUR,
      },
    ],
    encryptedProjectKey: "pk",
    retentionLimit: 10,
  };
}

const stripAnsi = (value: string) =>
  value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");

describe("parseVersion", () => {
  test("accepts plain and v-prefixed numbers", () => {
    expect(parseVersion("3")).toBe(3);
    expect(parseVersion("v12")).toBe(12);
    expect(parseVersion(" V2 ")).toBe(2);
  });

  test("rejects zero, negatives and garbage", () => {
    expect(parseVersion("0")).toBeNull();
    expect(parseVersion("-1")).toBeNull();
    expect(parseVersion("1.5")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  test("formats recent timestamps", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(formatRelativeTime(NOW - 2 * HOUR, NOW)).toBe("2h ago");
    expect(formatRelativeTime(NOW - 3 * 24 * HOUR, NOW)).toBe("3d ago");
  });

  test("falls back to a date for old timestamps", () => {
    expect(formatRelativeTime(Date.UTC(2026, 0, 15), NOW)).toBe("2026-01-15");
  });
});

describe("buildHistoryRows", () => {
  test("puts the current value first, then versions newest first", () => {
    const rows = buildHistoryRows(makeHistory());
    expect(rows.map((row) => row.version)).toEqual([3, 2, 1]);
    expect(rows[0]).toMatchObject({
      current: true,
      changeType: "current",
      changedBy: "alice@example.com",
    });
  });

  test("falls back to the user id when no email is known", () => {
    const rows = buildHistoryRows(makeHistory());
    expect(rows[1]!.changedBy).toBe("user_2");
  });

  test("omits the current row for a deleted secret", () => {
    const rows = buildHistoryRows(
      makeHistory({ isDeleted: true, currentVersion: null, encryptedValue: null }),
    );
    expect(rows.map((row) => row.version)).toEqual([2, 1]);
    expect(rows.every((row) => !row.current)).toBe(true);
  });
});

describe("renderHistoryTable", () => {
  test("masks values when not revealed", () => {
    const lines = renderHistoryTable(buildHistoryRows(makeHistory()), null, NOW).map(stripAnsi);
    expect(lines[0]).toMatch(/^VERSION\s+CHANGE\s+WHEN\s+BY\s+VALUE$/);
    expect(lines).toHaveLength(4);
    for (const line of lines.slice(1)) {
      expect(line.endsWith(MASKED_VALUE)).toBe(true);
      expect(line).not.toContain("enc-");
    }
    expect(lines[1]).toMatch(/^v3\s+current\s+1h ago\s+alice@example\.com/);
  });

  test("shows decrypted values when revealed", () => {
    const values = new Map([
      [3, "three"],
      [2, "two"],
      [1, "one"],
    ]);
    const lines = renderHistoryTable(buildHistoryRows(makeHistory()), values, NOW).map(stripAnsi);
    expect(lines[1]!.endsWith("three")).toBe(true);
    expect(lines[3]!.endsWith("one")).toBe(true);
  });
});

describe("toHistoryJson", () => {
  test("omits values unless revealed", () => {
    const history = makeHistory();
    const json = toHistoryJson(history, buildHistoryRows(history), null, { environment: "prod" });
    expect(json).toMatchObject({
      key: "API_KEY",
      environment: "prod",
      folder: null,
      retentionLimit: 10,
    });
    expect(json.versions[0]).not.toHaveProperty("value");
    expect(json.versions[0]!.changedAt).toBe(new Date(NOW - HOUR).toISOString());
  });

  test("includes decrypted values when revealed", () => {
    const history = makeHistory();
    const values = new Map([
      [3, "three"],
      [2, "two"],
    ]);
    const json = toHistoryJson(history, buildHistoryRows(history), values, {
      environment: "prod",
      folder: "api",
    });
    expect(json.folder).toBe("api");
    expect(json.versions.map((entry) => entry.value)).toEqual(["three", "two", null]);
  });
});
