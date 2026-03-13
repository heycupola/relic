import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

mock.module("@repo/logger", () => ({
  createLogger: () => ({ error: mock(), info: mock(), debug: mock(), warn: mock() }),
  trackEvent: mock(),
  trackError: mock(),
  initLogger: mock(() => Promise.resolve()),
  flushTelemetry: mock(() => Promise.resolve()),
  saveTelemetryPreference: mock(),
  getTelemetryPreference: mock(() => null),
  isFirstRun: mock(() => false),
  getConfigDir: mock(() => "/tmp"),
  getLogsDir: mock(() => "/tmp"),
}));

mock.module("ora", () => ({
  default: () => ({
    start: mock(function (this: unknown) {
      return this;
    }),
    stop: mock(),
    succeed: mock(),
    warn: mock(),
    fail: mock(),
    set text(_v: string) {
      // no-op
    },
  }),
}));

mock.module("../lib/api", () => ({
  getApi: mock(() => ({})),
  exportSecretsViaApiKey: mock(),
  fetchUserKeysViaApiKey: mock(),
  ProPlanRequiredError: class extends Error {
    upgradeUrl: string;
    constructor(msg: string, url: string) {
      super(msg);
      this.upgradeUrl = url;
    }
  },
}));

mock.module("../lib/config", () => ({
  findConfig: mock(() => Promise.resolve(null)),
  configExists: mock(() => Promise.resolve(false)),
  createConfig: mock(() => ({ project_id: "" })),
  createRelicDir: mock(() => Promise.resolve("")),
  getConfigFilePath: mock(() => "relic.toml"),
  saveConfig: mock(() => Promise.resolve("")),
  loadConfig: mock(() => Promise.resolve(null)),
  getRelicDir: mock(() => ""),
  getCacheDbPath: mock(() => ""),
  findRelicDir: mock(() => Promise.resolve(null)),
}));

mock.module("../lib/crypto", () => ({
  getProjectKey: mock(),
  decryptSecrets: mock(),
  ProjectKeyError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

mock.module("../ffi/bridge", () => ({
  RunnerBridge: { getInstance: mock(() => Promise.resolve({})) },
}));

// NOTE: Do not mock helpers/cache or @repo/auth here. mock.module() is global and persists
// to other test files. run.test.ts needs real implementations. Our scope validation test
// exits before any cache/auth usage, so no mocks are needed.

const { default: run, resolveProjectId } = await import("./run");

describe("run validation", () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("rejects invalid scope before reaching decrypt pipeline", async () => {
    try {
      await run(["echo", "hi"], { environment: "prod", scope: "invalid" as any });
    } catch {
      // process.exit throws
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join(" ");
    expect(output).toContain("--scope must be");
  });
});

describe("resolveProjectId", () => {
  const originalEnv = process.env.RELIC_PROJECT_ID;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RELIC_PROJECT_ID = originalEnv;
    } else {
      delete process.env.RELIC_PROJECT_ID;
    }
  });

  test("returns options.project when provided", () => {
    const result = resolveProjectId({ environment: "prod", project: "proj_123" });
    expect(result).toBe("proj_123");
  });

  test("falls back to RELIC_PROJECT_ID env var", () => {
    process.env.RELIC_PROJECT_ID = "env_proj_456";
    const result = resolveProjectId({ environment: "prod" });
    expect(result).toBe("env_proj_456");
  });

  test("returns null when neither is set", () => {
    delete process.env.RELIC_PROJECT_ID;
    const result = resolveProjectId({ environment: "prod" });
    expect(result).toBeNull();
  });
});
