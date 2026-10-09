import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  compileIgnore,
  listScanFiles,
  parseEnvKeys,
  parseGitignore,
  scanEnvReads,
  scanFiles,
} from "./env-keys";

// Sandboxed runners can forbid writes under .git/, which makes `git init` fail.
function canInitGitRepo(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "relic-git-probe-"));
  try {
    return Bun.spawnSync(["git", "init", "-q"], { cwd: dir, stderr: "ignore" }).exitCode === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("parseEnvKeys", () => {
  test("reads keys from assignments, exports, and bare names", () => {
    const content = [
      "# Database",
      "DATABASE_URL=postgres://localhost/db",
      "export API_TOKEN=changeme",
      "  PADDED_KEY = value",
      "EMPTY=",
      "BARE_KEY",
      "",
      "# COMMENTED_OUT=1",
    ].join("\n");

    expect(parseEnvKeys(content)).toEqual([
      "DATABASE_URL",
      "API_TOKEN",
      "PADDED_KEY",
      "EMPTY",
      "BARE_KEY",
    ]);
  });

  test("skips continuation lines of multi-line quoted values", () => {
    const content = [
      'PRIVATE_KEY="-----BEGIN KEY-----',
      "NOT_A_KEY=inside the value",
      '-----END KEY-----"',
      "AFTER=1",
      "SINGLE='one line'",
      "NEXT=2",
    ].join("\n");

    expect(parseEnvKeys(content)).toEqual(["PRIVATE_KEY", "AFTER", "SINGLE", "NEXT"]);
  });

  test("handles CRLF line endings and de-duplicates keys", () => {
    expect(parseEnvKeys("A=1\r\nB=2\r\nA=3\r\n")).toEqual(["A", "B"]);
  });

  test("ignores lines that are not key assignments", () => {
    expect(parseEnvKeys("not a key line\n1INVALID=x\nKEY WITH SPACE=1")).toEqual([]);
  });
});

describe("scanEnvReads", () => {
  const keysOf = (content: string) => scanEnvReads(content).map((r) => r.key);

  test("finds JS and TS env reads", () => {
    const content = `
      const a = process.env.DATABASE_URL;
      const b = process.env["REDIS_URL"];
      const c = process.env['SINGLE_QUOTED'];
      const d = import.meta.env.VITE_API_URL;
      const e = Bun.env.BUN_KEY;
      const f = process.env?.OPTIONAL_CHAIN;
      const g = import.meta.env[\`TEMPLATE_KEY\`];
    `;

    expect(keysOf(content).sort()).toEqual([
      "BUN_KEY",
      "DATABASE_URL",
      "OPTIONAL_CHAIN",
      "REDIS_URL",
      "SINGLE_QUOTED",
      "TEMPLATE_KEY",
      "VITE_API_URL",
    ]);
  });

  test("finds Python env reads", () => {
    const content = `
import os
a = os.environ["SECRET_KEY"]
b = os.getenv('DEBUG')
c = os.environ.get("SENTRY_DSN", "")
d = os.getenv("WITH_DEFAULT", "x")
`;

    expect(keysOf(content).sort()).toEqual(["DEBUG", "SECRET_KEY", "SENTRY_DSN", "WITH_DEFAULT"]);
  });

  test("finds destructured reads", () => {
    const content = `
      const { STRIPE_KEY, PORT: port, HOST = "localhost", ...rest } = process.env;
      const { VITE_PUBLIC } = import.meta.env;
    `;

    expect(keysOf(content).sort()).toEqual(["HOST", "PORT", "STRIPE_KEY", "VITE_PUBLIC"]);
  });

  test("skips Vite built-ins on import.meta.env only", () => {
    const content = `
      import.meta.env.MODE;
      import.meta.env.DEV;
      const { PROD, BASE_URL } = import.meta.env;
      process.env.MODE;
    `;

    expect(keysOf(content)).toEqual(["MODE"]);
  });

  test("ignores look-alikes and dynamic access", () => {
    const content = `
      myprocess.env.NOPE;
      process.environment.NOPE;
      process.env[name];
      const { NOPE } = process.env.NESTED;
      apos.environ["NOPE"];
    `;

    expect(keysOf(content)).toEqual(["NESTED"]);
  });

  test("reports the first line each key appears on", () => {
    const content = "\nprocess.env.FIRST;\n\nprocess.env.SECOND;\nprocess.env.FIRST;";

    expect(scanEnvReads(content)).toEqual([
      { key: "FIRST", line: 2 },
      { key: "SECOND", line: 4 },
    ]);
  });
});

describe("compileIgnore", () => {
  test("matches exact names and wildcards", () => {
    const isIgnored = compileIgnore(["NODE_ENV", " PORT ", "VITE_*", "", "*_DEBUG"]);

    expect(isIgnored("NODE_ENV")).toBe(true);
    expect(isIgnored("PORT")).toBe(true);
    expect(isIgnored("VITE_API_URL")).toBe(true);
    expect(isIgnored("APP_DEBUG")).toBe(true);
    expect(isIgnored("NODE_ENVX")).toBe(false);
    expect(isIgnored("MY_VITE_KEY")).toBe(false);
  });
});

describe("parseGitignore", () => {
  test("matches unanchored names at any depth and anchored paths from the root", () => {
    const ignored = parseGitignore("# comment\ngenerated\n/local-only\nlogs/\n*.gen.ts\n!keep");

    expect(ignored("generated/a.ts")).toBe(true);
    expect(ignored("src/generated/a.ts")).toBe(true);
    expect(ignored("local-only/a.ts")).toBe(true);
    expect(ignored("src/local-only/a.ts")).toBe(false);
    expect(ignored("logs/a.ts")).toBe(true);
    expect(ignored("src/types.gen.ts")).toBe(true);
    expect(ignored("src/index.ts")).toBe(false);
  });
});

describe("listScanFiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "relic-scan-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules/pkg"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, "generated"), { recursive: true });
    await writeFile(join(root, "src/index.ts"), "process.env.APP_KEY;");
    await writeFile(join(root, "src/app.py"), 'os.getenv("PY_KEY")');
    await writeFile(join(root, "src/readme.md"), "process.env.DOC_KEY");
    await writeFile(join(root, "node_modules/pkg/index.js"), "process.env.DEP_KEY;");
    await writeFile(join(root, "dist/index.js"), "process.env.BUILD_KEY;");
    await writeFile(join(root, "generated/client.ts"), "process.env.GEN_KEY;");
    await writeFile(join(root, ".gitignore"), "generated/\n");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const relativeFiles = async () =>
    (await listScanFiles([root])).map((file) => relative(root, file)).sort();

  test("walks directories without git, honoring .gitignore and skipping build output", async () => {
    expect(await relativeFiles()).toEqual(["src/app.py", "src/index.ts"]);
  });

  test.skipIf(!canInitGitRepo())("uses git to list files inside a repository", async () => {
    Bun.spawnSync(["git", "init", "-q"], { cwd: root });
    await writeFile(join(root, "src/untracked.ts"), "process.env.UNTRACKED;");
    await writeFile(join(root, "src/excluded.ts"), "process.env.EXCLUDED;");
    await writeFile(join(root, ".git/info/exclude"), "src/excluded.ts\n");

    expect(await relativeFiles()).toEqual(["src/app.py", "src/index.ts", "src/untracked.ts"]);
  });

  test("accepts explicit files and rejects missing paths", async () => {
    const files = await listScanFiles([join(root, "src/index.ts"), join(root, "src/readme.md")]);
    expect(files).toEqual([join(root, "src/index.ts")]);

    await expect(listScanFiles([join(root, "missing")])).rejects.toThrow("Scan path not found");
  });

  test("scanFiles maps keys to their locations", async () => {
    const { keys, filesScanned } = await scanFiles(await listScanFiles([root]), root);

    expect(filesScanned).toBe(2);
    expect(Object.fromEntries(keys)).toEqual({
      APP_KEY: [{ file: "src/index.ts", line: 1 }],
      PY_KEY: [{ file: "src/app.py", line: 1 }],
    });
  });
});
