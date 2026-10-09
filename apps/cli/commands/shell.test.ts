import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const mockTrackEvent = mock();

mock.module("@repo/logger", () => ({
  createLogger: () => ({ error: mock(), info: mock(), debug: mock(), warn: mock() }),
  trackEvent: mockTrackEvent,
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
  exportSecretsViaServiceToken: mock(() => Promise.reject(new Error("export failed"))),
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
// to other test files. These tests exit before any cache/auth usage.

const { default: shell, buildShellEnv, isInsideRelicShell, resolveShell } = await import("./shell");

describe("resolveShell", () => {
  const exists = () => true;
  const missing = () => false;

  test("uses $SHELL when it exists", () => {
    expect(resolveShell({ SHELL: "/bin/zsh" }, "darwin", exists)).toBe("/bin/zsh");
  });

  test("falls back to /bin/sh when $SHELL is unset", () => {
    expect(resolveShell({}, "linux", exists)).toBe("/bin/sh");
  });

  test("falls back to /bin/sh when $SHELL points to a missing file", () => {
    expect(resolveShell({ SHELL: "/opt/gone/fish" }, "linux", missing)).toBe("/bin/sh");
  });

  test("keeps a non-absolute $SHELL for PATH lookup", () => {
    expect(resolveShell({ SHELL: "fish" }, "linux", missing)).toBe("fish");
  });

  test("uses COMSPEC on Windows when $SHELL is unusable", () => {
    expect(
      resolveShell(
        { SHELL: "/usr/bin/bash", COMSPEC: "C:\\Windows\\system32\\cmd.exe" },
        "win32",
        missing,
      ),
    ).toBe("C:\\Windows\\system32\\cmd.exe");
  });

  test("falls back to cmd.exe on Windows without COMSPEC", () => {
    expect(resolveShell({}, "win32", missing)).toBe("cmd.exe");
  });
});

describe("buildShellEnv", () => {
  test("adds marker variables alongside secrets", () => {
    const env = buildShellEnv(
      { API_KEY: "value" },
      { environment: "development", projectId: "proj_123", folder: "api", scope: "server" },
    );

    expect(env).toEqual({
      API_KEY: "value",
      RELIC_SHELL: "1",
      RELIC_ENVIRONMENT: "development",
      RELIC_PROJECT_ID: "proj_123",
      RELIC_FOLDER: "api",
      RELIC_SCOPE: "server",
    });
  });

  test("omits optional markers that are not known", () => {
    const env = buildShellEnv({}, { environment: "production" });

    expect(env).toEqual({ RELIC_SHELL: "1", RELIC_ENVIRONMENT: "production" });
  });

  test("markers take precedence over secrets with the same name", () => {
    const env = buildShellEnv(
      { RELIC_SHELL: "0", RELIC_ENVIRONMENT: "spoofed" },
      { environment: "staging" },
    );

    expect(env.RELIC_SHELL).toBe("1");
    expect(env.RELIC_ENVIRONMENT).toBe("staging");
  });
});

describe("isInsideRelicShell", () => {
  test("detects RELIC_SHELL=1", () => {
    expect(isInsideRelicShell({ RELIC_SHELL: "1" })).toBe(true);
  });

  test("ignores other values", () => {
    expect(isInsideRelicShell({})).toBe(false);
    expect(isInsideRelicShell({ RELIC_SHELL: "0" })).toBe(false);
  });
});

describe("shell command", () => {
  const savedEnv = {
    RELIC_SHELL: process.env.RELIC_SHELL,
    RELIC_ENVIRONMENT: process.env.RELIC_ENVIRONMENT,
    RELIC_SERVICE_TOKEN: process.env.RELIC_SERVICE_TOKEN,
    RELIC_OIDC_TOKEN: process.env.RELIC_OIDC_TOKEN,
  };
  let exitSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockTrackEvent.mockClear();
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function stderr(): string {
    return errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join(" ");
  }

  test("rejects invalid scope", async () => {
    await expect(shell({ environment: "dev", scope: "invalid" as any })).rejects.toThrow(
      "process.exit",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain("--scope must be");
  });

  test("refuses to nest inside an existing relic shell", async () => {
    process.env.RELIC_SHELL = "1";
    process.env.RELIC_ENVIRONMENT = "staging";

    await expect(shell({ environment: "dev" })).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderr()).toContain("Already inside a relic shell");
    expect(stderr()).toContain("staging");
    expect(stderr()).toContain("--force");
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  test("--force bypasses the nesting check", async () => {
    process.env.RELIC_SHELL = "1";
    process.env.RELIC_SERVICE_TOKEN = "relic_sa_test";
    process.env.RELIC_OIDC_TOKEN = "oidc_test";

    await expect(shell({ environment: "dev", force: true })).rejects.toThrow("process.exit");

    expect(stderr()).not.toContain("Already inside a relic shell");
    expect(mockTrackEvent).toHaveBeenCalledWith("cli_shell_started", {
      has_folder: false,
      has_scope: false,
      nested: true,
      mode: "service_token",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "cli_shell_completed",
      expect.objectContaining({ success: false }),
    );
  });
});
