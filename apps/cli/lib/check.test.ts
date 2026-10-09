import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCheckReport,
  type CollectedKeys,
  collectRequiredKeys,
  formatCheckReport,
  readCheckIgnore,
} from "./check";
import { compileIgnore } from "./env-keys";

function collected(keys: Record<string, string[]>): CollectedKeys {
  return {
    keys: new Map(
      Object.entries(keys).map(([key, files]) => [key, files.map((file) => ({ file }))]),
    ),
    sources: [{ type: "file", path: ".env.example", keys: Object.keys(keys).length }],
  };
}

const noIgnore = () => false;

describe("readCheckIgnore", () => {
  test("returns the configured ignore list", () => {
    expect(readCheckIgnore({ project_id: "p", check: { ignore: ["NODE_ENV", "PORT"] } })).toEqual([
      "NODE_ENV",
      "PORT",
    ]);
  });

  test("treats configs without a [check] table as empty", () => {
    expect(readCheckIgnore({ project_id: "p" })).toEqual([]);
    expect(readCheckIgnore({ project_id: "p", check: {} })).toEqual([]);
    expect(readCheckIgnore(undefined)).toEqual([]);
  });

  test("rejects a malformed ignore list", () => {
    expect(() => readCheckIgnore({ check: { ignore: "NODE_ENV" } })).toThrow(
      "[check] ignore must be an array of strings",
    );
    expect(() => readCheckIgnore({ check: { ignore: [1] } })).toThrow();
  });
});

describe("collectRequiredKeys", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "relic-check-"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, ".env.example"), "DATABASE_URL=postgres://example\nSHARED=1\n");
    await writeFile(join(root, ".env.template"), "TEMPLATE_ONLY=\nSHARED=\n");
    await writeFile(join(root, "custom.env"), "CUSTOM_KEY=placeholder\n");
    await writeFile(
      join(root, "src/index.ts"),
      "const a = process.env.SHARED;\nprocess.env.CODE_ONLY;",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("merges the default templates next to relic.toml", async () => {
    const result = await collectRequiredKeys({ rootDir: root, cwd: root });

    expect([...result.keys.keys()].sort()).toEqual(["DATABASE_URL", "SHARED", "TEMPLATE_ONLY"]);
    expect(result.keys.get("SHARED")).toEqual([
      { file: ".env.example" },
      { file: ".env.template" },
    ]);
    expect(result.sources).toEqual([
      { type: "file", path: ".env.example", keys: 2 },
      { type: "file", path: ".env.template", keys: 2 },
    ]);
  });

  test("--from replaces the default templates", async () => {
    const result = await collectRequiredKeys({ rootDir: root, cwd: root, from: ["custom.env"] });

    expect([...result.keys.keys()]).toEqual(["CUSTOM_KEY"]);
  });

  test("fails when a --from file does not exist", async () => {
    await expect(
      collectRequiredKeys({ rootDir: root, cwd: root, from: ["missing.env"] }),
    ).rejects.toThrow("Required keys file not found: missing.env");
  });

  test("adds scanned keys on top of the templates", async () => {
    const result = await collectRequiredKeys({ rootDir: root, cwd: root, scan: [] });

    expect([...result.keys.keys()].sort()).toEqual([
      "CODE_ONLY",
      "DATABASE_URL",
      "SHARED",
      "TEMPLATE_ONLY",
    ]);
    expect(result.keys.get("CODE_ONLY")).toEqual([{ file: "src/index.ts", line: 2 }]);
    expect(result.sources.at(-1)).toEqual({ type: "scan", path: ".", keys: 2, filesScanned: 1 });
  });

  test("returns no sources when nothing is configured", async () => {
    const empty = await mkdtemp(join(tmpdir(), "relic-check-empty-"));
    try {
      const result = await collectRequiredKeys({ rootDir: empty, cwd: empty });
      expect(result.sources).toEqual([]);
      expect(result.keys.size).toBe(0);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("buildCheckReport", () => {
  test("reports missing and unused keys", () => {
    const report = buildCheckReport({
      environment: "production",
      required: collected({ DATABASE_URL: [".env.example"], STRIPE_KEY: [".env.example"] }),
      available: ["DATABASE_URL", "LEGACY_TOKEN"],
      compare: null,
      isIgnored: noIgnore,
    });

    expect(report.ok).toBe(false);
    expect(report.required).toEqual({
      total: 2,
      present: 1,
      missing: [{ key: "STRIPE_KEY", locations: [".env.example"] }],
      unused: ["LEGACY_TOKEN"],
    });
  });

  test("passes with unused keys unless strict", () => {
    const input = {
      environment: "production",
      required: collected({ DATABASE_URL: [".env.example"] }),
      available: ["DATABASE_URL", "EXTRA"],
      compare: null,
      isIgnored: noIgnore,
    };

    expect(buildCheckReport(input).ok).toBe(true);
    expect(buildCheckReport({ ...input, strict: true }).ok).toBe(false);
  });

  test("applies the ignore list to required, available, and compared names", () => {
    const report = buildCheckReport({
      environment: "staging",
      required: collected({ NODE_ENV: ["src/a.ts"], API_URL: [".env.example"] }),
      available: ["API_URL", "VITE_DEBUG"],
      compare: { environment: "production", available: ["API_URL", "VITE_ONLY_PROD"] },
      isIgnored: compileIgnore(["NODE_ENV", "VITE_*"]),
      strict: true,
    });

    expect(report.ok).toBe(true);
    expect(report.ignored).toEqual(["NODE_ENV", "VITE_DEBUG", "VITE_ONLY_PROD"]);
    expect(report.required?.missing).toEqual([]);
    expect(report.compare).toEqual({
      base: "staging",
      other: "production",
      onlyInBase: [],
      onlyInOther: [],
    });
  });

  test("compares environments without required keys", () => {
    const report = buildCheckReport({
      environment: "staging",
      required: null,
      available: ["SHARED", "STAGING_ONLY"],
      compare: { environment: "production", available: ["SHARED", "PROD_ONLY"] },
      isIgnored: noIgnore,
    });

    expect(report.required).toBeNull();
    expect(report.compare?.onlyInBase).toEqual(["STAGING_ONLY"]);
    expect(report.compare?.onlyInOther).toEqual(["PROD_ONLY"]);
    expect(report.ok).toBe(true);
    expect(
      buildCheckReport({
        environment: "staging",
        required: null,
        available: ["SHARED", "STAGING_ONLY"],
        compare: { environment: "production", available: ["SHARED"] },
        isIgnored: noIgnore,
        strict: true,
      }).ok,
    ).toBe(false);
  });

  test("de-duplicates and formats key locations", () => {
    const report = buildCheckReport({
      environment: "production",
      required: {
        keys: new Map([
          [
            "REDIS_URL",
            [{ file: "src/cache.ts", line: 3 }, { file: ".env.example" }, { file: ".env.example" }],
          ],
        ]),
        sources: [],
      },
      available: [],
      compare: null,
      isIgnored: noIgnore,
    });

    expect(report.required?.missing).toEqual([
      { key: "REDIS_URL", locations: ["src/cache.ts:3", ".env.example"] },
    ]);
  });
});

describe("formatCheckReport", () => {
  test("lists missing, unused, and compared names with a summary", () => {
    const output = formatCheckReport(
      buildCheckReport({
        environment: "production",
        folder: "api",
        scope: "server",
        required: collected({ DATABASE_URL: [".env.example"], STRIPE_KEY: [".env.example"] }),
        available: ["DATABASE_URL", "LEGACY_TOKEN"],
        compare: { environment: "staging", available: ["DATABASE_URL", "STAGING_ONLY"] },
        isIgnored: noIgnore,
      }),
    );

    expect(output).toContain("production/api (server)");
    expect(output).toContain("Missing (1)");
    expect(output).toContain("STRIPE_KEY");
    expect(output).toContain("Unused (1)");
    expect(output).toContain("LEGACY_TOKEN");
    expect(output).toContain("Only in production (1)");
    expect(output).toContain("Only in staging (1)");
    expect(output).toContain("1/2 required keys present, 1 missing, 1 unused");
  });

  test("shows a passing summary", () => {
    const output = formatCheckReport(
      buildCheckReport({
        environment: "production",
        required: collected({ DATABASE_URL: [".env.example"] }),
        available: ["DATABASE_URL"],
        compare: null,
        isIgnored: noIgnore,
      }),
    );

    expect(output).toContain("✓ 1/1 required keys present");
    expect(output).not.toContain("Missing");
  });
});
