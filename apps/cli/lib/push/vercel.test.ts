import { describe, expect, test } from "bun:test";
import { createFakeDeps } from "./test-helpers";
import { PlatformAuthError, PushExitCode, PushUsageError } from "./types";
import {
  parseVercelTargets,
  resolveVercelToken,
  VercelAdapter,
  vercelAdapterFactory,
  vercelAuthFilePaths,
} from "./vercel";

const AUTH_JSON = JSON.stringify({ token: "vca_cli_token" });

describe("vercelAuthFilePaths", () => {
  test("uses the documented XDG data locations per OS", () => {
    expect(vercelAuthFilePaths(createFakeDeps({ platform: "darwin" }).deps)[0]).toBe(
      "/home/dev/Library/Application Support/com.vercel.cli/auth.json",
    );
    expect(vercelAuthFilePaths(createFakeDeps({ platform: "linux" }).deps)[0]).toBe(
      "/home/dev/.local/share/com.vercel.cli/auth.json",
    );
    expect(
      vercelAuthFilePaths(
        createFakeDeps({ platform: "win32", env: { APPDATA: "/Users/dev/AppData/Roaming" } }).deps,
      )[0],
    ).toBe("/Users/dev/AppData/Roaming/xdg.data/com.vercel.cli/auth.json");
    expect(vercelAuthFilePaths(createFakeDeps({ env: { XDG_DATA_HOME: "/data" } }).deps)[0]).toBe(
      "/data/com.vercel.cli/auth.json",
    );
  });

  test("falls back to the legacy ~/.now directory", () => {
    expect(vercelAuthFilePaths(createFakeDeps().deps)).toContain("/home/dev/.now/auth.json");
  });
});

describe("resolveVercelToken", () => {
  test("prefers VERCEL_TOKEN", async () => {
    const { deps } = createFakeDeps({
      env: { VERCEL_TOKEN: "env_token" },
      files: { "/home/dev/.local/share/com.vercel.cli/auth.json": AUTH_JSON },
    });
    expect(await resolveVercelToken(deps)).toBe("env_token");
  });

  test("reads the Vercel CLI auth file", async () => {
    const { deps } = createFakeDeps({
      files: { "/home/dev/.local/share/com.vercel.cli/auth.json": AUTH_JSON },
    });
    expect(await resolveVercelToken(deps)).toBe("vca_cli_token");
  });

  test("reports an expired CLI session with the login command", async () => {
    const { deps } = createFakeDeps({
      files: {
        "/home/dev/.local/share/com.vercel.cli/auth.json": JSON.stringify({
          token: "vca_old",
          expiresAt: Math.floor(Date.now() / 1000) - 60,
        }),
      },
    });
    const err = await resolveVercelToken(deps).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.exitCode).toBe(PushExitCode.AuthRequired);
    expect(err.hint).toContain("vercel login");
  });

  test("fails with the login command when no credentials exist", async () => {
    const err = await resolveVercelToken(createFakeDeps().deps).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.message).toBe("No Vercel credentials found.");
    expect(err.hint).toContain("vercel login");
    expect(err.hint).toContain("VERCEL_TOKEN");
  });
});

describe("parseVercelTargets", () => {
  test("defaults to production", () => {
    expect(parseVercelTargets(undefined)).toEqual(["production"]);
  });

  test("accepts repeated and comma-separated values", () => {
    expect(parseVercelTargets(["preview,production", "development"])).toEqual([
      "production",
      "preview",
      "development",
    ]);
  });

  test("rejects unknown targets", () => {
    expect(() => parseVercelTargets(["staging"])).toThrow(PushUsageError);
  });
});

describe("vercelAdapterFactory", () => {
  test("reads project and team from .vercel/project.json", async () => {
    const { deps } = createFakeDeps({
      env: { VERCEL_TOKEN: "tok" },
      files: {
        "/work/.vercel/project.json": JSON.stringify({ projectId: "prj_1", orgId: "team_9" }),
      },
    });
    const adapter = await vercelAdapterFactory.create(
      { environment: "production", target: "vercel" },
      deps,
    );
    expect(adapter.destination).toBe("prj_1 (production)");
    expect(adapter.productionLike).toBe(true);
  });

  test("asks the user to link a project when none is configured", async () => {
    const { deps } = createFakeDeps({ env: { VERCEL_TOKEN: "tok" } });
    const err = await vercelAdapterFactory
      .create({ environment: "production", target: "vercel" }, deps)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PushUsageError);
    expect(err.hint).toContain("vercel link");
  });
});

describe("VercelAdapter", () => {
  test("lists with decryption and only exposes values it can compare", async () => {
    const { deps, fetchCalls } = createFakeDeps({
      fetch: () => ({
        body: {
          envs: [
            {
              id: "1",
              key: "A",
              type: "encrypted",
              value: "a",
              decrypted: true,
              target: ["production"],
            },
            { id: "2", key: "B", type: "sensitive", value: "", target: ["production"] },
            {
              id: "3",
              key: "C",
              type: "encrypted",
              value: "c",
              decrypted: true,
              target: ["production", "preview"],
            },
            { id: "4", key: "D", type: "encrypted", value: "d", target: ["preview"] },
            {
              id: "5",
              key: "E",
              type: "encrypted",
              value: "e",
              target: ["production"],
              gitBranch: "feat",
            },
          ],
        },
      }),
    });

    const adapter = new VercelAdapter(deps, "tok", "prj_1", "team_9", ["production"]);
    const remote = await adapter.list();

    expect(remote).toEqual([{ name: "A", value: "a" }, { name: "B" }, { name: "C" }]);
    const url = new URL(fetchCalls[0]!.url);
    expect(url.pathname).toBe("/v10/projects/prj_1/env");
    expect(url.searchParams.get("decrypt")).toBe("true");
    expect(url.searchParams.get("teamId")).toBe("team_9");
    expect(fetchCalls[0]!.headers.authorization).toBe("Bearer tok");
  });

  test("patches exact matches, detaches overlaps, and creates sensitive variables", async () => {
    const { deps, fetchCalls } = createFakeDeps({
      fetch: (call) =>
        call.method === "GET"
          ? {
              body: {
                envs: [
                  { id: "env_a", key: "A", type: "sensitive", target: ["production"] },
                  { id: "env_b", key: "B", type: "encrypted", target: ["production", "preview"] },
                ],
              },
            }
          : { body: {} },
    });

    const adapter = new VercelAdapter(deps, "tok", "prj_1", undefined, ["production"]);
    await adapter.list();
    await adapter.upsert({ A: "new-a", B: "new-b", C: "new-c" });

    const writes = fetchCalls.slice(1).map((c) => ({
      method: c.method,
      path: new URL(c.url).pathname,
      body: c.body,
    }));
    expect(writes).toEqual([
      { method: "PATCH", path: "/v9/projects/prj_1/env/env_a", body: { value: "new-a" } },
      { method: "PATCH", path: "/v9/projects/prj_1/env/env_b", body: { target: ["preview"] } },
      {
        method: "POST",
        path: "/v10/projects/prj_1/env",
        body: [
          { key: "B", value: "new-b", type: "sensitive", target: ["production"] },
          { key: "C", value: "new-c", type: "sensitive", target: ["production"] },
        ],
      },
    ]);
  });

  test("uses the encrypted type when development is targeted", () => {
    const { deps } = createFakeDeps();
    const adapter = new VercelAdapter(deps, "tok", "prj_1", undefined, ["preview", "development"]);
    expect(adapter.newVariableType).toBe("encrypted");
    expect(adapter.productionLike).toBe(false);
  });

  test("prune deletes entries owned only by the pushed targets", async () => {
    const { deps, fetchCalls } = createFakeDeps({
      fetch: (call) =>
        call.method === "GET"
          ? {
              body: {
                envs: [
                  { id: "env_x", key: "OLD", type: "encrypted", target: ["production"] },
                  {
                    id: "env_y",
                    key: "SHARED",
                    type: "encrypted",
                    target: ["production", "development"],
                  },
                ],
              },
            }
          : { status: 204 },
    });

    const adapter = new VercelAdapter(deps, "tok", "prj_1", undefined, ["production"]);
    await adapter.list();
    await adapter.delete(["OLD", "SHARED"]);

    expect(fetchCalls.slice(1).map((c) => [c.method, new URL(c.url).pathname, c.body])).toEqual([
      ["DELETE", "/v9/projects/prj_1/env/env_x", undefined],
      ["PATCH", "/v9/projects/prj_1/env/env_y", { target: ["development"] }],
    ]);
  });

  test("maps a 401 to a platform auth error", async () => {
    const { deps } = createFakeDeps({
      fetch: () => ({ status: 401, body: { error: { message: "Not authorized" } } }),
    });
    const adapter = new VercelAdapter(deps, "tok", "prj_1", undefined, ["production"]);
    const err = await adapter.list().catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("vercel login");
  });

  test("reports rejected creates by name", async () => {
    const { deps } = createFakeDeps({
      fetch: (call) =>
        call.method === "POST"
          ? { status: 201, body: { failed: [{ error: { key: "C", code: "ENV_CONFLICT" } }] } }
          : { body: { envs: [] } },
    });
    const adapter = new VercelAdapter(deps, "tok", "prj_1", undefined, ["production"]);
    await adapter.list();
    await expect(adapter.upsert({ C: "value-c" })).rejects.toThrow(
      "Vercel rejected 1 variable(s): C",
    );
  });

  test("validates variable names", () => {
    const adapter = new VercelAdapter(createFakeDeps().deps, "tok", "prj", undefined, [
      "production",
    ]);
    expect(adapter.validate({ GOOD_NAME: "x", "bad-name": "y" })).toEqual([
      "bad-name: Vercel names may only contain letters, digits, and underscores",
    ]);
  });
});
