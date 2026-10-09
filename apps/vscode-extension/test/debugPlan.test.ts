import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bunAttachUrl,
  bunCommand,
  envPrefix,
  nodeLaunchConfig,
  pythonCommand,
  readRelicDebugSettings,
  runtimeForDebugType,
  UnsupportedDebugConfigError,
} from "../src/core/debugPlan";

describe("readRelicDebugSettings", () => {
  test("accepts true or an options object", () => {
    expect(readRelicDebugSettings(true)).toEqual({});
    expect(
      readRelicDebugSettings({ environment: "staging", scope: "server", folder: "api" }),
    ).toEqual({ environment: "staging", scope: "server", folder: "api" });
  });

  test("ignores missing or invalid values", () => {
    expect(readRelicDebugSettings(undefined)).toBeNull();
    expect(readRelicDebugSettings(false)).toBeNull();
    expect(readRelicDebugSettings({ scope: "everything" })).toEqual({});
  });
});

describe("runtimeForDebugType", () => {
  test("maps debugger types", () => {
    expect(runtimeForDebugType("pwa-node")).toBe("node");
    expect(runtimeForDebugType("bun")).toBe("bun");
    expect(runtimeForDebugType("debugpy")).toBe("python");
    expect(runtimeForDebugType("cppdbg")).toBeNull();
  });
});

describe("envPrefix", () => {
  test("re-applies launch env on Unix only", () => {
    expect(envPrefix({ LOG_LEVEL: "debug", SKIP: null }, "darwin")).toEqual([
      "env",
      "LOG_LEVEL=debug",
    ]);
    expect(envPrefix({ LOG_LEVEL: "debug" }, "win32")).toEqual([]);
    expect(envPrefix(undefined, "linux")).toEqual([]);
  });
});

describe("nodeLaunchConfig", () => {
  const options = {
    cliPath: "relic",
    target: { environment: "development" },
    port: 9555,
    platform: "darwin" as const,
  };

  test("wraps node with relic run and attaches on a fixed port", () => {
    const config = nodeLaunchConfig(
      {
        type: "node",
        request: "launch",
        program: "/app/index.js",
        runtimeArgs: ["--enable-source-maps"],
      },
      options,
    );
    expect(config.runtimeExecutable).toBe("relic");
    expect(config.runtimeArgs).toEqual([
      "run",
      "-e",
      "development",
      "--",
      "node",
      "--inspect-brk=127.0.0.1:9555",
      "--enable-source-maps",
    ]);
    expect(config.attachSimplePort).toBe(9555);
    expect(config.program).toBe("/app/index.js");
  });

  test("keeps tsx and forwards launch env", () => {
    const config = nodeLaunchConfig(
      { type: "node", runtimeExecutable: "tsx", env: { DEBUG: "app:*" } },
      options,
    );
    expect(config.runtimeArgs).toEqual([
      "run",
      "-e",
      "development",
      "--",
      "env",
      "DEBUG=app:*",
      "tsx",
      "--inspect-brk=127.0.0.1:9555",
    ]);
  });

  test("rejects package-manager runtimes", () => {
    expect(() => nodeLaunchConfig({ type: "node", runtimeExecutable: "npm" }, options)).toThrow(
      UnsupportedDebugConfigError,
    );
  });
});

describe("bunCommand", () => {
  test("waits for the inspector on a known URL", () => {
    expect(
      bunCommand(
        { program: "/app/index.ts", args: ["--port", "3000"], runtimeArgs: ["--smol"] },
        { port: 6499, platform: "linux" },
      ),
    ).toEqual([
      "bun",
      "--inspect-wait=127.0.0.1:6499/relic",
      "--smol",
      "/app/index.ts",
      "--port",
      "3000",
    ]);
    expect(bunAttachUrl(6499)).toBe("ws://127.0.0.1:6499/relic");
  });

  test("requires a program", () => {
    expect(() => bunCommand({}, { port: 1, platform: "linux" })).toThrow(
      UnsupportedDebugConfigError,
    );
  });
});

describe("pythonCommand", () => {
  test("builds a bootstrap command for files and modules", () => {
    const base = {
      python: "python3",
      port: 5678,
      readyFile: "/tmp/ready",
      platform: "linux" as const,
    };
    const file = pythonCommand({ program: "/app/main.py", args: ["-v"] }, base);
    expect(file[0]).toBe("python3");
    expect(file[1]).toBe("-c");
    expect(file.slice(3)).toEqual([
      "",
      "127.0.0.1",
      "5678",
      "/tmp/ready",
      "file",
      "/app/main.py",
      "-v",
    ]);

    const module = pythonCommand(
      { module: "app.server" },
      { ...base, python: ["/venv/bin/python", "-X", "dev"] },
    );
    expect(module.slice(0, 4)).toEqual(["/venv/bin/python", "-X", "dev", "-c"]);
    expect(module.slice(-2)).toEqual(["module", "app.server"]);
  });

  test("requires a program or module", () => {
    expect(() =>
      pythonCommand({}, { python: "python3", port: 1, readyFile: "x", platform: "linux" }),
    ).toThrow(UnsupportedDebugConfigError);
  });

  const python = spawnSync("python3", ["--version"]).status === 0;

  test.skipIf(!python)("bootstrap listens, signals readiness, then runs the program", () => {
    const dir = mkdtempSync(join(tmpdir(), "relic-debugpy-test-"));
    try {
      const libs = join(dir, "libs");
      mkdirSync(join(libs, "debugpy"), { recursive: true });
      writeFileSync(
        join(libs, "debugpy", "__init__.py"),
        "calls = []\ndef listen(addr): calls.append(('listen', addr))\ndef wait_for_client(): calls.append(('wait',))\n",
      );
      const program = join(dir, "main.py");
      writeFileSync(
        program,
        "import sys, debugpy\nprint(debugpy.calls)\nprint(sys.argv)\nprint(__name__)\n",
      );
      const readyFile = join(dir, "ready");

      const [bin, ...args] = pythonCommand(
        { program, args: ["--flag"] },
        { python: "python3", debugpyLibs: libs, port: 5678, readyFile, platform: process.platform },
      );
      const result = spawnSync(bin!, args, { encoding: "utf8" });

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(existsSync(readyFile)).toBe(true);
      const [calls, argv, name] = result.stdout.trim().split("\n");
      expect(calls).toBe("[('listen', ('127.0.0.1', 5678)), ('wait',)]");
      expect(argv).toBe(`['${program}', '--flag']`);
      expect(name).toBe("__main__");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
