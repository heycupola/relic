import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_ENTRY = join(import.meta.dir, "../index.ts");

interface RecordedRequest {
  path: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

let server: ReturnType<typeof Bun.serve>;
let requests: RecordedRequest[] = [];
let namesByEnvironment: Record<string, string[]> = {};

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Record<string, unknown>;
      const path = new URL(request.url).pathname;
      requests.push({ path, authorization: request.headers.get("Authorization"), body });

      const names = namesByEnvironment[String(body.environmentName)];
      if (!names) {
        return Response.json({ error: "Environment not found" }, { status: 404 });
      }
      return Response.json({
        secrets: names.map((key) => ({ key, scope: "shared", valueType: "string" })),
        count: names.length,
        environmentId: "env_1",
        folderId: null,
      });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

describe("relic check", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    requests = [];
    namesByEnvironment = {
      production: ["DATABASE_URL", "LEGACY_TOKEN"],
      staging: ["DATABASE_URL", "STRIPE_KEY"],
    };

    projectDir = await mkdtemp(join(tmpdir(), "relic-check-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "relic-check-home-"));
    await writeFile(join(projectDir, "relic.toml"), 'project_id = "proj_123"\n');
    await writeFile(
      join(projectDir, ".env.example"),
      "DATABASE_URL=postgres://placeholder-value\nSTRIPE_KEY=sk_placeholder\n",
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  async function runCheck(args: string[], env: Record<string, string> = {}) {
    const proc = Bun.spawn(["bun", CLI_ENTRY, "check", ...args], {
      cwd: projectDir,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: homeDir,
        NO_COLOR: "1",
        RELIC_TELEMETRY: "false",
        RELIC_CONVEX_SITE_URL: server.url.origin,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  }

  const serviceToken = { RELIC_SERVICE_TOKEN: "rsk_test_token" };

  test("fails when a required key is missing, using one names-only request", async () => {
    const result = await runCheck(["-e", "production", "--json"], serviceToken);

    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.required.missing).toEqual([{ key: "STRIPE_KEY", locations: [".env.example"] }]);
    expect(report.required.unused).toEqual(["LEGACY_TOKEN"]);

    expect(requests).toEqual([
      {
        path: "/api/sa/secrets/names",
        authorization: "Bearer rsk_test_token",
        body: { environmentName: "production" },
      },
    ]);
  });

  test("passes when every required key exists", async () => {
    const result = await runCheck(["-e", "staging"], serviceToken);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("2/2 required keys present");
  });

  test("never prints values from the template files", async () => {
    const result = await runCheck(["-e", "production"], serviceToken);

    const output = result.stdout + result.stderr;
    expect(output).toContain("STRIPE_KEY");
    expect(output).not.toContain("placeholder");
  });

  test("--strict fails on unused keys", async () => {
    namesByEnvironment.staging = ["DATABASE_URL", "STRIPE_KEY", "EXTRA"];

    expect((await runCheck(["-e", "staging"], serviceToken)).exitCode).toBe(0);
    expect((await runCheck(["-e", "staging", "--strict"], serviceToken)).exitCode).toBe(1);
  });

  test("forwards folder and scope filters", async () => {
    await runCheck(["-e", "staging", "-f", "api", "-s", "SERVER"], serviceToken);

    expect(requests[0]?.body).toEqual({
      environmentName: "staging",
      folderName: "api",
      scope: "server",
    });
  });

  test("--compare works without required-key sources", async () => {
    await rm(join(projectDir, ".env.example"));

    const result = await runCheck(
      ["-e", "staging", "--compare", "production", "--json"],
      serviceToken,
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.required).toBeNull();
    expect(report.compare).toEqual({
      base: "staging",
      other: "production",
      onlyInBase: ["STRIPE_KEY"],
      onlyInOther: ["LEGACY_TOKEN"],
    });
    expect(requests.map((r) => r.body.environmentName).sort()).toEqual(["production", "staging"]);

    const strict = await runCheck(["-e", "staging", "--compare", "production", "--strict"], {
      ...serviceToken,
    });
    expect(strict.exitCode).toBe(1);
  });

  test("errors without any required-key source or --compare", async () => {
    await rm(join(projectDir, ".env.example"));

    const result = await runCheck(["-e", "production", "--json"], serviceToken);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain("No required keys found");
    expect(requests).toEqual([]);
  });

  test("uses the API key route with the project from relic.toml and its ignore list", async () => {
    await writeFile(
      join(projectDir, "relic.toml"),
      'project_id = "proj_123"\n\n[check]\nignore = ["STRIPE_*"]\n',
    );

    const result = await runCheck(["-e", "production", "--json"], {
      RELIC_API_KEY: "relic_sk_test",
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).ignored).toEqual(["STRIPE_KEY"]);
    expect(requests).toEqual([
      {
        path: "/api/secrets/names",
        authorization: "Bearer relic_sk_test",
        body: { projectId: "proj_123", environmentName: "production" },
      },
    ]);
  });

  test("merges --ignore flags with the config", async () => {
    const result = await runCheck(
      ["-e", "production", "--ignore", "STRIPE_KEY,OTHER", "--ignore", "LEGACY_TOKEN", "--strict"],
      serviceToken,
    );

    expect(result.exitCode).toBe(0);
  });

  test("reports API errors as JSON", async () => {
    const result = await runCheck(["-e", "preview", "--json"], serviceToken);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, error: "Environment not found" });
  });

  test("rejects comparing an environment with itself", async () => {
    const result = await runCheck(["-e", "staging", "--compare", "Staging"], serviceToken);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--compare must name a different environment");
    expect(requests).toEqual([]);
  });
});
