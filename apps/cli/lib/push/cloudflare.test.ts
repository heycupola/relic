import { describe, expect, test } from "bun:test";
import {
  ApiCloudflareAdapter,
  cloudflareAdapterFactory,
  readWranglerConfig,
  resolveWorkerName,
  WranglerCloudflareAdapter,
} from "./cloudflare";
import { createFakeDeps, fail, ok } from "./test-helpers";
import { PlatformAuthError, PushUsageError } from "./types";

const WRANGLER = "/work/node_modules/.bin/wrangler";
const BASE_OPTIONS = { environment: "production", target: "cloudflare" };

describe("readWranglerConfig", () => {
  test("parses wrangler.toml", async () => {
    const { deps } = createFakeDeps({
      files: {
        "/work/wrangler.toml":
          'name = "api"\naccount_id = "acc_1"\n[env.staging]\nname = "api-stg"\n',
      },
    });
    const result = await readWranglerConfig(deps);
    expect(result?.file).toBe("wrangler.toml");
    expect(result?.config).toMatchObject({ name: "api", account_id: "acc_1" });
    expect(result?.config.env?.staging?.name).toBe("api-stg");
  });

  test("parses wrangler.jsonc with comments, trailing commas, and URLs in strings", async () => {
    const { deps } = createFakeDeps({
      files: {
        "/work/wrangler.jsonc": `{
          // Worker name
          "name": "edge", /* inline */
          "routes": ["https://example.com/*"],
          "vars": { "NOTE": "a, }" },
        }`,
      },
    });
    const config = (await readWranglerConfig(deps))!.config as {
      name: string;
      routes: string[];
      vars: Record<string, string>;
    };
    expect(config.name).toBe("edge");
    expect(config.routes).toEqual(["https://example.com/*"]);
    expect(config.vars.NOTE).toBe("a, }");
  });

  test("returns null when no config exists", async () => {
    expect(await readWranglerConfig(createFakeDeps().deps)).toBeNull();
  });
});

describe("resolveWorkerName", () => {
  const config = { name: "api", env: { staging: { name: "api-stg" }, qa: {} } };

  test("follows wrangler's legacy environment naming", () => {
    expect(resolveWorkerName(config, undefined, undefined)).toBe("api");
    expect(resolveWorkerName(config, undefined, "staging")).toBe("api-stg");
    expect(resolveWorkerName(config, undefined, "qa")).toBe("api-qa");
    expect(resolveWorkerName(config, "other", undefined)).toBe("other");
    expect(resolveWorkerName(config, "other", "qa")).toBe("other-qa");
    expect(resolveWorkerName(undefined, undefined, undefined)).toBeUndefined();
  });
});

describe("cloudflareAdapterFactory", () => {
  test("prefers wrangler when it is installed", async () => {
    const { deps } = createFakeDeps({
      files: { "/work/wrangler.toml": 'name = "api"', [WRANGLER]: "" },
      env: { CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acc" },
    });
    const adapter = await cloudflareAdapterFactory.create(BASE_OPTIONS, deps);
    expect(adapter).toBeInstanceOf(WranglerCloudflareAdapter);
    expect(adapter.destination).toBe("api");
    expect(adapter.productionLike).toBe(true);
  });

  test("falls back to the API when wrangler is missing", async () => {
    const { deps } = createFakeDeps({
      files: { "/work/wrangler.toml": 'name = "api"\naccount_id = "acc_cfg"' },
      env: { CLOUDFLARE_API_TOKEN: "tok" },
    });
    const adapter = await cloudflareAdapterFactory.create(
      { ...BASE_OPTIONS, wranglerEnv: "staging" },
      deps,
    );
    expect(adapter).toBeInstanceOf(ApiCloudflareAdapter);
    expect(adapter.destination).toBe("api-staging");
    expect(adapter.productionLike).toBe(false);
  });

  test("explains how to log in when no credentials exist", async () => {
    const { deps } = createFakeDeps({ files: { "/work/wrangler.toml": 'name = "api"' } });
    const err = await cloudflareAdapterFactory.create(BASE_OPTIONS, deps).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("npx wrangler login");
    expect(err.hint).toContain("CLOUDFLARE_API_TOKEN");
  });

  test("asks for an account ID when only the token is set", async () => {
    const { deps } = createFakeDeps({
      files: { "/work/wrangler.toml": 'name = "api"' },
      env: { CLOUDFLARE_API_TOKEN: "tok" },
    });
    const err = await cloudflareAdapterFactory.create(BASE_OPTIONS, deps).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  test("requires a worker name", async () => {
    const err = await cloudflareAdapterFactory
      .create(BASE_OPTIONS, createFakeDeps().deps)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PushUsageError);
    expect(err.hint).toContain("--worker");
  });
});

describe("WranglerCloudflareAdapter", () => {
  test("uploads with `wrangler secret bulk` on stdin, never a file argument", async () => {
    const { deps, execCalls } = createFakeDeps();
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api-stg", undefined, "staging");

    await adapter.upsert({ API_KEY: "k-123", MULTI: "line1\nline2" });

    expect(execCalls).toHaveLength(1);
    const call = execCalls[0]!;
    expect(call.command).toBe(WRANGLER);
    expect(call.args).toEqual(["secret", "bulk", "--env", "staging"]);
    expect(JSON.parse(call.options!.input!)).toEqual({ API_KEY: "k-123", MULTI: "line1\nline2" });
    expect(call.options!.input).not.toContain("\n");
  });

  test("splits uploads into batches of 100", async () => {
    const { deps, execCalls } = createFakeDeps();
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api", "api", undefined);
    const secrets = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`K${i}`, `v${i}`]));

    await adapter.upsert(secrets);

    expect(execCalls).toHaveLength(2);
    expect(execCalls[0]!.args).toEqual(["secret", "bulk", "--name", "api"]);
    expect(Object.keys(JSON.parse(execCalls[0]!.options!.input!))).toHaveLength(100);
    expect(Object.keys(JSON.parse(execCalls[1]!.options!.input!))).toHaveLength(50);
  });

  test("lists names from JSON output even after a banner", async () => {
    const { deps } = createFakeDeps({
      exec: () => ok(' ⛅️ wrangler 4.0.0\n-----\n[{"name":"A","type":"secret_text"}]'),
    });
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api", undefined, undefined);
    expect(await adapter.list()).toEqual([{ name: "A" }]);
  });

  test("treats a missing worker as having no secrets", async () => {
    const { deps } = createFakeDeps({
      exec: () => fail("This Worker does not exist on your account. [code: 10007]"),
    });
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api", undefined, undefined);
    expect(await adapter.list()).toEqual([]);
  });

  test("maps wrangler auth failures to the login command", async () => {
    const { deps } = createFakeDeps({
      exec: () =>
        fail(
          "In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work.",
        ),
    });
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api", undefined, undefined);
    const err = await adapter.list().catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("npx wrangler login");
  });

  test("deletes each pruned secret", async () => {
    const { deps, execCalls } = createFakeDeps();
    const adapter = new WranglerCloudflareAdapter(deps, WRANGLER, "api", undefined, "staging");
    await adapter.delete(["OLD_A", "OLD_B"]);
    expect(execCalls.map((c) => c.args)).toEqual([
      ["secret", "delete", "OLD_A", "--env", "staging"],
      ["secret", "delete", "OLD_B", "--env", "staging"],
    ]);
  });
});

describe("ApiCloudflareAdapter", () => {
  test("lists, puts, and deletes secrets through the Workers API", async () => {
    const { deps, fetchCalls } = createFakeDeps({
      fetch: (call) =>
        call.method === "GET"
          ? { body: { success: true, result: [{ name: "A", type: "secret_text" }] } }
          : { body: { success: true, result: {} } },
    });
    const adapter = new ApiCloudflareAdapter(deps, "tok", "acc_1", "api", undefined);

    expect(await adapter.list()).toEqual([{ name: "A" }]);
    await adapter.upsert({ B: "value-b" });
    await adapter.delete(["A"]);

    const base = "https://api.cloudflare.com/client/v4/accounts/acc_1/workers/scripts/api/secrets";
    expect(fetchCalls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["GET", base, undefined],
      ["PUT", base, { name: "B", text: "value-b", type: "secret_text" }],
      ["DELETE", `${base}/A`, undefined],
    ]);
    expect(fetchCalls[0]!.headers.authorization).toBe("Bearer tok");
  });

  test("maps a 403 to a platform auth error", async () => {
    const { deps } = createFakeDeps({
      fetch: () => ({ status: 403, body: { success: false, errors: [{ code: 10000 }] } }),
    });
    const adapter = new ApiCloudflareAdapter(deps, "tok", "acc_1", "api", undefined);
    await expect(adapter.list()).rejects.toBeInstanceOf(PlatformAuthError);
  });

  test("explains that the worker must exist before secrets can be added", async () => {
    const { deps } = createFakeDeps({
      fetch: () => ({ status: 404, body: { success: false, errors: [{ code: 10007 }] } }),
    });
    const adapter = new ApiCloudflareAdapter(deps, "tok", "acc_1", "api", undefined);
    const err = await adapter.upsert({ A: "value-a" }).catch((e) => e);
    expect(err).toBeInstanceOf(PushUsageError);
    expect(err.hint).toContain("wrangler deploy");
  });
});
