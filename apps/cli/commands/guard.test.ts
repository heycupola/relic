import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { parse } from "smol-toml";
import type { ConfigResult, RelicConfig } from "../lib/config";
import type { ValuesDeps } from "../lib/guard/values";
import { createTempRepo, type TempRepo } from "../lib/guard/test-repo";
import { EXIT_CLEAN, EXIT_ERROR, EXIT_FINDINGS, formatReport, runGuardScan } from "./guard";

const STRIPE_KEY = "sk_live_9fJq2LmXv81";
const DB_PASSWORD = "hunter2-correct-horse";

function serviceTokenDeps(secrets: Record<string, string>): ValuesDeps {
  return {
    env: { RELIC_SERVICE_TOKEN: "rst_test" },
    validateSession: mock(() => Promise.resolve({ isValid: false })),
    getPassword: mock(() => Promise.resolve(null)),
    getApi: mock(() => Promise.reject(new Error("unused"))),
    getProjectKey: mock(() => Promise.reject(new Error("unused"))),
    decryptSecrets: mock(() => Promise.reject(new Error("unused"))),
    exportWithServiceToken: mock(() => Promise.resolve(secrets)),
    exportWithApiKey: mock(() => Promise.resolve({})),
  };
}

const offlineDeps: ValuesDeps = {
  ...serviceTokenDeps({}),
  env: {},
  validateSession: mock(() => Promise.reject(new Error("fetch failed"))),
};

async function findTestConfig(dir: string): Promise<ConfigResult | null> {
  const file = Bun.file(join(dir, "relic.toml"));
  if (!(await file.exists())) return null;
  const config = parse(await file.text()) as unknown as RelicConfig;
  return { config, configPath: join(dir, "relic.toml"), rootDir: dir };
}

describe("runGuardScan", () => {
  let repo: TempRepo;
  const secrets = { STRIPE_KEY, DB_PASSWORD, DEBUG: "true", PORT: "3000" };

  beforeEach(async () => {
    repo = await createTempRepo();
    await repo.write("relic.toml", 'project_id = "project_123"\n');
    await repo.write("README.md", "# app\n");
    await repo.commit("init");
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  function scan(paths: string[], options: Parameters<typeof runGuardScan>[1], deps?: ValuesDeps) {
    return runGuardScan(paths, options, {
      cwd: repo.dir,
      findConfig: findTestConfig,
      valuesDeps: deps ?? serviceTokenDeps(secrets),
    });
  }

  test("reports staged secret values and dotenv files without printing values", async () => {
    await repo.write("src/billing.ts", `export const stripe = "${STRIPE_KEY}";\n`);
    await repo.write(".env.production", `DB_PASSWORD=${DB_PASSWORD}\n`);
    await repo.write(".env.example", "DB_PASSWORD=\n");
    await repo.git("add", "-A");

    const { report, exitCode } = await scan([], { staged: true, environment: ["production"] });

    expect(exitCode).toBe(EXIT_FINDINGS);
    expect(report.findings).toEqual([
      { type: "dotenv", file: ".env.production" },
      {
        type: "value",
        file: ".env.production",
        line: 1,
        column: 13,
        secrets: [{ key: "DB_PASSWORD", environment: "production" }],
        preview: "hu********",
      },
      {
        type: "value",
        file: "src/billing.ts",
        line: 1,
        column: 24,
        secrets: [{ key: "STRIPE_KEY", environment: "production" }],
        preview: "sk********",
      },
    ]);

    const json = JSON.stringify(report);
    const text = formatReport(report);
    for (const value of [STRIPE_KEY, DB_PASSWORD]) {
      expect(json).not.toContain(value);
      expect(text).not.toContain(value);
    }
  });

  test("ignores values that only exist in the working tree", async () => {
    await repo.write("src/billing.ts", "export const stripe = process.env.STRIPE_KEY;\n");
    await repo.git("add", "-A");
    await repo.write("src/billing.ts", `export const stripe = "${STRIPE_KEY}";\n`);

    const { exitCode, report } = await scan([], { staged: true, environment: ["production"] });
    expect(report.findings).toEqual([]);
    expect(exitCode).toBe(EXIT_CLEAN);
  });

  test("honors inline ignores and .relicguardignore", async () => {
    await repo.write("src/a.ts", `const k = "${STRIPE_KEY}"; // relic-guard-ignore\n`);
    await repo.write("test/fixtures/b.ts", `const k = "${STRIPE_KEY}";\n`);
    await repo.write(".relicguardignore", "# fixtures\ntest/fixtures/\n");
    await repo.git("add", "-A");

    const { report } = await scan([], { staged: true, environment: ["production"] });
    expect(report.findings).toEqual([]);
  });

  test("honors the [guard] allowlist and min_length in relic.toml", async () => {
    await repo.write(
      "relic.toml",
      'project_id = "project_123"\n\n[guard]\nallow = ["test/.env.test"]\nmin_length = 30\n',
    );
    await repo.write("test/.env.test", `STRIPE_KEY=${STRIPE_KEY}\n`);
    await repo.git("add", "-A");

    const { report, exitCode } = await scan([], { staged: true, environment: ["production"] });
    expect(report.findings).toEqual([]);
    expect(report.values).toMatchObject({ status: "loaded", patterns: 0 });
    expect(exitCode).toBe(EXIT_CLEAN);
  });

  test("scans added lines across a commit range and tags the commit", async () => {
    const base = await repo.git("rev-parse", "HEAD");
    await repo.write("src/config.ts", `line\nconst db = "${DB_PASSWORD}";\n`);
    const leak = await repo.commit("leak");
    await repo.write("src/config.ts", "line\nconst db = process.env.DB_PASSWORD;\n");
    await repo.commit("fix");

    const { report, exitCode } = await scan([], {
      range: `${base}..HEAD`,
      environment: ["production"],
    });

    expect(exitCode).toBe(EXIT_FINDINGS);
    expect(report.mode).toBe("range");
    expect(report.findings).toEqual([
      {
        type: "value",
        file: "src/config.ts",
        line: 2,
        column: 13,
        secrets: [{ key: "DB_PASSWORD", environment: "production" }],
        preview: "hu********",
        commit: leak,
      },
    ]);
  });

  test("still detects dotenv files when values can't be loaded", async () => {
    await repo.write(".env", "A=1\n");
    await repo.git("add", "-A");

    const { report, exitCode } = await scan([], { staged: true }, offlineDeps);
    expect(exitCode).toBe(EXIT_FINDINGS);
    expect(report.findings).toEqual([{ type: "dotenv", file: ".env" }]);
    expect(report.values).toEqual({
      status: "skipped",
      reason: "could not load secrets (fetch failed)",
    });
    expect(formatReport(report)).toContain("Value matching skipped");
  });

  test("passes when values are skipped unless --require-values is set", async () => {
    await repo.write("src/ok.ts", "export {};\n");
    await repo.git("add", "-A");

    expect((await scan([], { staged: true }, offlineDeps)).exitCode).toBe(EXIT_CLEAN);
    expect((await scan([], { staged: true, requireValues: true }, offlineDeps)).exitCode).toBe(
      EXIT_ERROR,
    );
  });

  test("--no-values skips loading entirely", async () => {
    const deps = serviceTokenDeps(secrets);
    await repo.write("src/a.ts", `const k = "${STRIPE_KEY}";\n`);
    await repo.git("add", "-A");

    const { report } = await scan([], { staged: true, values: false }, deps);
    expect(report.values).toEqual({ status: "disabled" });
    expect(report.findings).toEqual([]);
    expect(deps.exportWithServiceToken).not.toHaveBeenCalled();
  });

  test("scans paths in the working tree", async () => {
    await repo.write("src/a.ts", `const k = "${STRIPE_KEY}";\n`);
    await repo.write("docs/b.md", `${STRIPE_KEY}\n`);

    const { report } = await scan(["src"], { environment: ["production"] });
    expect(report.mode).toBe("paths");
    expect(report.findings.map((f) => f.file)).toEqual(["src/a.ts"]);
  });

  test("rejects conflicting options", async () => {
    expect(scan([], { staged: true, range: "HEAD~1..HEAD" })).rejects.toThrow(
      "--staged and --range cannot be used together",
    );
    expect(scan(["src"], { staged: true })).rejects.toThrow("paths cannot be combined");
    expect(scan([], { minLength: "zero" })).rejects.toThrow("positive integer");
  });
});
