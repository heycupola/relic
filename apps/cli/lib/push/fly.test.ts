import { describe, expect, test } from "bun:test";
import { FlyAdapter, flyAdapterFactory, formatFlyImport } from "./fly";
import { createFakeDeps, fail, ok } from "./test-helpers";
import { PlatformAuthError, PushUsageError } from "./types";

const FLY = "/usr/local/bin/fly";
const BASE_OPTIONS = { environment: "production", target: "fly" };

describe("flyAdapterFactory", () => {
  test("reads the app name from fly.toml", async () => {
    const { deps } = createFakeDeps({
      binaries: { fly: FLY },
      files: { "/work/fly.toml": 'app = "acme-api"\nprimary_region = "ams"\n' },
    });
    const adapter = await flyAdapterFactory.create(BASE_OPTIONS, deps);
    expect(adapter.destination).toBe("acme-api");
  });

  test("requires an app name", async () => {
    const { deps } = createFakeDeps({ binaries: { fly: FLY } });
    const err = await flyAdapterFactory.create(BASE_OPTIONS, deps).catch((e) => e);
    expect(err).toBeInstanceOf(PushUsageError);
    expect(err.hint).toContain("--fly-app");
  });

  test("tells the user to run fly auth login", async () => {
    const { deps } = createFakeDeps({
      binaries: { flyctl: FLY },
      exec: () => fail("Error: No access token available. Please login with 'flyctl auth login'"),
    });
    const err = await flyAdapterFactory
      .create({ ...BASE_OPTIONS, flyApp: "acme-api" }, deps)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("fly auth login");
  });
});

describe("FlyAdapter", () => {
  test("imports secrets through stdin", async () => {
    const { deps, execCalls } = createFakeDeps();
    const adapter = new FlyAdapter(deps, FLY, "acme-api", true);

    await adapter.upsert({ API_KEY: "k=123", CERT: "line1\nline2" });

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]!.args).toEqual(["secrets", "import", "-a", "acme-api", "--stage"]);
    expect(execCalls[0]!.options?.input).toBe('API_KEY=k=123\nCERT="""line1\nline2"""');
  });

  test("lists names from either JSON casing and unsets pruned names in one call", async () => {
    const { deps, execCalls } = createFakeDeps({
      exec: (call) =>
        call.args[1] === "list" ? ok('[{"Name":"A","Digest":"x"},{"name":"B"}]') : ok(),
    });
    const adapter = new FlyAdapter(deps, FLY, "acme-api", false);

    expect(await adapter.list()).toEqual([{ name: "A" }, { name: "B" }]);
    await adapter.delete(["A", "B"]);
    expect(execCalls[1]!.args).toEqual(["secrets", "unset", "A", "B", "-a", "acme-api"]);
  });

  test("rejects values that fly secrets import cannot round-trip", () => {
    const adapter = new FlyAdapter(createFakeDeps().deps, FLY, "acme-api", false);
    expect(
      adapter
        .validate({ QUOTED: '"x"', SPACED: " x", TRIPLE: 'a"""b', FINE: "x" })
        .map((problem) => problem.split(":")[0]),
    ).toEqual(["QUOTED", "SPACED", "TRIPLE"]);
  });

  test("formatFlyImport keeps single-line values on one line", () => {
    expect(formatFlyImport({ A: "1", B: "2" })).toBe("A=1\nB=2");
  });
});
