import { describe, expect, test } from "bun:test";
import {
  computePlan,
  formatPlan,
  hasChanges,
  isProductionLikeName,
  redact,
  secretsToWrite,
} from "./plan";

const LOCAL = { API_KEY: "sk_live_123", DB_URL: "postgres://db", NEW_FLAG: "true" };

describe("computePlan", () => {
  test("classifies added, updated, and unchanged names", () => {
    const plan = computePlan(
      LOCAL,
      [{ name: "API_KEY" }, { name: "DB_URL", value: "postgres://db" }, { name: "STALE" }],
      false,
    );

    expect(plan).toEqual({
      add: ["NEW_FLAG"],
      update: ["API_KEY"],
      unchanged: ["DB_URL"],
      remove: [],
    });
  });

  test("never removes remote names unless prune is set", () => {
    const remote = [{ name: "STALE" }, { name: "API_KEY" }];
    expect(computePlan(LOCAL, remote, false).remove).toEqual([]);
    expect(computePlan(LOCAL, remote, true).remove).toEqual(["STALE"]);
  });

  test("treats a value mismatch across duplicate remote entries as an update", () => {
    const plan = computePlan(
      { DB_URL: "postgres://db" },
      [
        { name: "DB_URL", value: "postgres://db" },
        { name: "DB_URL", value: "postgres://other" },
      ],
      false,
    );
    expect(plan.update).toEqual(["DB_URL"]);
  });

  test("secretsToWrite only includes added and updated secrets", () => {
    const plan = computePlan(LOCAL, [{ name: "DB_URL", value: "postgres://db" }], false);
    expect(secretsToWrite(LOCAL, plan)).toEqual({ API_KEY: "sk_live_123", NEW_FLAG: "true" });
    expect(hasChanges(plan)).toBe(true);
    expect(hasChanges({ add: [], update: [], unchanged: ["X"], remove: [] })).toBe(false);
  });
});

describe("formatPlan", () => {
  test("prints names and counts but never values", () => {
    const plan = computePlan(LOCAL, [{ name: "API_KEY" }, { name: "STALE" }], true);
    const output = formatPlan(plan, { label: "Vercel", destination: "prj_1", prune: true }).join(
      "\n",
    );

    expect(output).toContain("API_KEY");
    expect(output).toContain("STALE");
    expect(output).toContain("1 to remove");
    for (const value of Object.values(LOCAL)) {
      expect(output).not.toContain(value);
    }
  });
});

describe("redact", () => {
  test("replaces raw and JSON-escaped values", () => {
    const text = 'bad line: TOKEN=abc123 and {"v":"line1\\nline2"}';
    expect(redact(text, ["abc123", "line1\nline2"])).toBe(
      'bad line: TOKEN=[redacted] and {"v":"[redacted]"}',
    );
  });

  test("leaves very short values alone to keep messages readable", () => {
    expect(redact("exit code 1", ["1"])).toBe("exit code 1");
  });
});

describe("isProductionLikeName", () => {
  test.each([
    ["production", true],
    ["prod", true],
    ["eu-prod", true],
    ["main", true],
    ["staging", false],
    ["preview", false],
    ["product-dev", false],
    [undefined, false],
  ])("%s -> %s", (name, expected) => {
    expect(isProductionLikeName(name)).toBe(expected);
  });
});
