import { describe, expect, mock, test } from "bun:test";
import { executePush, type PushContext, parseScopes } from "./execute";
import { createFakeDeps, type FetchCall, fail, ok } from "./test-helpers";
import { PushExitCode, type PushOptions, PushUsageError } from "./types";

const RELIC_SECRETS = {
  API_KEY: "sk_live_abcdef",
  DB_URL: "postgres://user:pass@db/app",
  NEXT_PUBLIC_URL: "https://acme.dev",
};

const REMOTE_ENVS = [
  { id: "env_api", key: "API_KEY", type: "sensitive", target: ["production"] },
  {
    id: "env_url",
    key: "NEXT_PUBLIC_URL",
    type: "encrypted",
    value: "https://acme.dev",
    decrypted: true,
    target: ["production"],
  },
  { id: "env_old", key: "LEGACY_TOKEN", type: "sensitive", target: ["production"] },
];

function setup(
  overrides: Partial<PushContext> = {},
  fetchHandler?: (call: FetchCall) => { status?: number; body?: unknown } | undefined,
) {
  const { deps, fetchCalls } = createFakeDeps({
    env: { VERCEL_TOKEN: "vercel_tok" },
    files: { "/work/.vercel/project.json": JSON.stringify({ projectId: "prj_web" }) },
    fetch:
      fetchHandler ??
      ((call) => (call.method === "GET" ? { body: { envs: REMOTE_ENVS } } : { body: {} })),
  });

  const out: string[] = [];
  const err: string[] = [];
  const ctx: PushContext = {
    deps,
    loadSecrets: mock(async () => ({ secrets: { ...RELIC_SECRETS } })),
    confirm: mock(async () => true),
    isInteractive: true,
    isCi: false,
    status: () => {},
    stopStatus: () => {},
    out: (line = "") => out.push(line),
    err: (line = "") => err.push(line),
    ...overrides,
  };

  const writes = () => fetchCalls.filter((call) => call.method !== "GET");
  const output = () => [...out, ...err].join("\n");
  return { ctx, fetchCalls, writes, output };
}

const OPTIONS: PushOptions = { environment: "production", target: "vercel" };

describe("executePush", () => {
  test("dry run prints the plan, records a dry-run audit, and writes nothing", async () => {
    const { ctx, writes, output } = setup();

    const result = await executePush({ ...OPTIONS, dryRun: true, prune: true }, ctx);

    expect(result.exitCode).toBe(PushExitCode.Success);
    expect(writes()).toHaveLength(0);
    expect(ctx.confirm).not.toHaveBeenCalled();
    expect(ctx.loadSecrets).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }), {
      scopes: undefined,
      push: { target: "vercel", destination: "prj_web (production)", dryRun: true },
    });
    expect(result.plan).toEqual({
      add: ["DB_URL"],
      update: ["API_KEY"],
      unchanged: ["NEXT_PUBLIC_URL"],
      remove: ["LEGACY_TOKEN"],
    });

    const text = output();
    expect(text).toContain("Dry run");
    for (const value of Object.values(RELIC_SECRETS)) {
      expect(text).not.toContain(value);
    }
  });

  test("requires --yes in non-interactive sessions", async () => {
    const { ctx, writes, output } = setup({ isInteractive: false });

    const result = await executePush(OPTIONS, ctx);

    expect(result.exitCode).toBe(PushExitCode.Usage);
    expect(writes()).toHaveLength(0);
    expect(output()).toContain("--yes");
  });

  test("requires --yes in CI even with a TTY", async () => {
    const { ctx, writes } = setup({ isCi: true });
    const result = await executePush(OPTIONS, ctx);
    expect(result.exitCode).toBe(PushExitCode.Usage);
    expect(writes()).toHaveLength(0);
  });

  test("asks before writing to production and stops when declined", async () => {
    const { ctx, writes } = setup({ confirm: mock(async () => false) });

    const result = await executePush(OPTIONS, ctx);

    expect(ctx.confirm).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(PushExitCode.Cancelled);
    expect(writes()).toHaveLength(0);
  });

  test("writes added and updated secrets after confirmation, without pruning by default", async () => {
    const { ctx, writes } = setup();

    const result = await executePush(OPTIONS, ctx);

    expect(result.exitCode).toBe(PushExitCode.Success);
    expect(result.applied).toBe(true);
    expect(writes().map((call) => [call.method, new URL(call.url).pathname])).toEqual([
      ["PATCH", "/v9/projects/prj_web/env/env_api"],
      ["POST", "/v10/projects/prj_web/env"],
    ]);
    expect(writes().some((call) => call.method === "DELETE")).toBe(false);
  });

  test("--prune deletes platform secrets that are not in Relic", async () => {
    const { ctx, writes } = setup();

    await executePush({ ...OPTIONS, prune: true, yes: true }, ctx);

    expect(ctx.confirm).not.toHaveBeenCalled();
    expect(
      writes()
        .filter((call) => call.method === "DELETE")
        .map((call) => new URL(call.url).pathname),
    ).toEqual(["/v9/projects/prj_web/env/env_old"]);
  });

  test("does not prompt for non-production targets in an interactive shell", async () => {
    const { ctx, writes } = setup();

    const result = await executePush(
      { environment: "staging", target: "vercel", vercelTarget: ["preview"] },
      ctx,
    );

    expect(result.exitCode).toBe(PushExitCode.Success);
    expect(ctx.confirm).not.toHaveBeenCalled();
    expect(writes().length).toBeGreaterThan(0);
  });

  test("passes several scopes to the Relic export", async () => {
    const { ctx } = setup();

    await executePush({ ...OPTIONS, scope: "client,shared", dryRun: true }, ctx);

    expect(ctx.loadSecrets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scopes: ["client", "shared"] }),
    );
  });

  test("reports already-in-sync without writing", async () => {
    const { ctx, writes, output } = setup({
      loadSecrets: mock(async () => ({ secrets: { NEXT_PUBLIC_URL: "https://acme.dev" } })),
    });

    const result = await executePush(OPTIONS, ctx);

    expect(result.exitCode).toBe(PushExitCode.Success);
    expect(writes()).toHaveLength(0);
    expect(output()).toContain("already in sync");
  });

  test("fails on platform auth before decrypting anything from Relic", async () => {
    const { ctx, output } = setup({}, () => ({
      status: 401,
      body: { error: { message: "invalid token" } },
    }));

    const result = await executePush(OPTIONS, ctx);

    expect(result.exitCode).toBe(PushExitCode.AuthRequired);
    expect(ctx.loadSecrets).not.toHaveBeenCalled();
    expect(output()).toContain("vercel login");
  });

  test("redacts secret values that a platform CLI echoes in its errors", async () => {
    const { deps } = createFakeDeps({
      files: { "/work/wrangler.toml": 'name = "api"', "/work/node_modules/.bin/wrangler": "" },
      exec: (call) =>
        call.args[1] === "list"
          ? ok("[]")
          : fail(
              `✘ Could not parse input near "sk_live_abcdef" (DB_URL=postgres://user:pass@db/app)`,
            ),
    });
    const { ctx, output } = setup({ deps });

    const result = await executePush(
      { environment: "production", target: "cloudflare", yes: true },
      ctx,
    );

    expect(result.exitCode).toBe(PushExitCode.Failure);
    expect(output()).toContain("wrangler secret bulk failed");
    expect(output()).toContain("[redacted]");
    for (const value of Object.values(RELIC_SECRETS)) {
      expect(output()).not.toContain(value);
    }
  });

  test("stops with a usage error when the platform rejects names", async () => {
    const { ctx, writes, output } = setup({
      loadSecrets: mock(async () => ({ secrets: { "bad-name": "value-1" } })),
    });

    const result = await executePush({ ...OPTIONS, yes: true }, ctx);

    expect(result.exitCode).toBe(PushExitCode.Usage);
    expect(writes()).toHaveLength(0);
    expect(output()).toContain("bad-name");
  });

  test("rejects unknown targets", async () => {
    const { ctx, output } = setup();
    const result = await executePush({ environment: "production", target: "heroku" }, ctx);
    expect(result.exitCode).toBe(PushExitCode.Usage);
    expect(output()).toContain("Supported targets: vercel, cloudflare, github, fly");
  });
});

describe("parseScopes", () => {
  test("parses and de-duplicates comma-separated scopes", () => {
    expect(parseScopes("Client, shared,client")).toEqual(["client", "shared"]);
    expect(parseScopes(undefined)).toEqual([]);
  });

  test("rejects unknown scopes", () => {
    expect(() => parseScopes("client,public")).toThrow(PushUsageError);
  });
});
