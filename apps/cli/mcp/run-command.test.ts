import { describe, expect, test } from "bun:test";
import { buildChildEnv } from "../lib/env";
import {
  assertEnvDumpAllowed,
  detectEnvDumpCommand,
  EnvDumpBlockedError,
  isDangerousEnvDumpAllowed,
  redactSecrets,
  RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP,
  runCommandCaptured,
} from "./run-command";

describe("redactSecrets", () => {
  test("replaces every occurrence of each secret value with its key", () => {
    const output = redactSecrets("token=abcd1234 again abcd1234", { API_TOKEN: "abcd1234" });
    expect(output).toBe("token=[REDACTED:API_TOKEN] again [REDACTED:API_TOKEN]");
  });

  test("replaces longer values first so overlapping secrets are fully hidden", () => {
    const output = redactSecrets("url=postgres://user:hunter22@db", {
      DB_PASSWORD: "hunter22",
      DATABASE_URL: "postgres://user:hunter22@db",
    });
    expect(output).toBe("url=[REDACTED:DATABASE_URL]");
  });

  test("leaves values shorter than 4 characters alone", () => {
    expect(redactSecrets("PORT=80 DEBUG=1", { PORT: "80", DEBUG: "1" })).toBe("PORT=80 DEBUG=1");
  });

  test("leaves 3-character secrets alone (below MIN_REDACT_LENGTH)", () => {
    expect(redactSecrets("pin=xyz end", { PIN: "xyz" })).toBe("pin=xyz end");
  });

  test("handles values containing regex metacharacters", () => {
    expect(redactSecrets("x a.b*c(d) y", { WEIRD: "a.b*c(d)" })).toBe("x [REDACTED:WEIRD] y");
  });

  test("redacts printenv-style output", () => {
    const secrets = { STRIPE_KEY: "sk_live_123456", DB_URL: "postgres://x:y@z/db" };
    const env = Object.entries(secrets)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const redacted = redactSecrets(env, secrets);
    for (const value of Object.values(secrets)) {
      expect(redacted).not.toContain(value);
    }
    expect(redacted).toContain("STRIPE_KEY=[REDACTED:STRIPE_KEY]");
  });

  test("does not catch base64-encoded secret values (best-effort limitation)", () => {
    const secret = "super-secret-value";
    const encoded = Buffer.from(secret, "utf8").toString("base64");
    const output = redactSecrets(`token=${encoded}`, { API_TOKEN: secret });
    expect(output).toBe(`token=${encoded}`);
    expect(output).not.toContain("[REDACTED:");
  });

  test("does not catch hex-encoded or reversed secret values", () => {
    const secret = "hunter22token";
    const hex = Buffer.from(secret, "utf8").toString("hex");
    const reversed = [...secret].reverse().join("");
    expect(redactSecrets(`hex=${hex}`, { TOKEN: secret })).toContain(hex);
    expect(redactSecrets(`rev=${reversed}`, { TOKEN: secret })).toContain(reversed);
  });

  test("does not catch JSON-escaped variants that differ from the raw value", () => {
    const secret = 'line1\nline2"quote';
    // Output that only contains the JSON-string form, not the raw secret bytes.
    const jsonForm = JSON.stringify(secret).slice(1, -1);
    expect(jsonForm).not.toBe(secret);
    expect(redactSecrets(`v=${jsonForm}`, { MULTILINE: secret })).toContain(jsonForm);
  });
});

describe("detectEnvDumpCommand", () => {
  test("blocks bare env and printenv", () => {
    expect(detectEnvDumpCommand(["env"])).toBe("env");
    expect(detectEnvDumpCommand(["/usr/bin/env"])).toBe("env");
    expect(detectEnvDumpCommand(["printenv"])).toBe("printenv");
    expect(detectEnvDumpCommand(["printenv", "PATH"])).toBe("printenv");
  });

  test("allows env when launching a command", () => {
    expect(detectEnvDumpCommand(["env", "FOO=bar", "npm", "test"])).toBeNull();
    expect(detectEnvDumpCommand(["env", "-i", "PATH=/bin", "sh", "-c", "echo hi"])).toBeNull();
  });

  test("blocks bare set but allows set with options", () => {
    expect(detectEnvDumpCommand(["set"])).toBe("set");
    expect(detectEnvDumpCommand(["sh", "-c", "set"])).toBe("set");
    expect(detectEnvDumpCommand(["sh", "-c", "set -e; echo ok"])).toBeNull();
  });

  test("blocks env/printenv inside shell -c scripts", () => {
    expect(detectEnvDumpCommand(["sh", "-c", "env"])).toBe("env");
    expect(detectEnvDumpCommand(["bash", "-c", "printenv | head"])).toBe("printenv");
    expect(detectEnvDumpCommand(["zsh", "-c", "echo hi; env; echo bye"])).toBe("env");
  });

  test("blocks PowerShell environment listing", () => {
    expect(detectEnvDumpCommand(["pwsh", "-Command", "Get-ChildItem Env:"])).toBe(
      "PowerShell Env:",
    );
    expect(detectEnvDumpCommand(["powershell", "-c", "gci env:"])).toBe("PowerShell Env:");
    expect(
      detectEnvDumpCommand(["pwsh", "-c", "[System.Environment]::GetEnvironmentVariables()"]),
    ).toBe("PowerShell Env:");
  });

  test("blocks shell prefixes before env/set/printenv", () => {
    expect(detectEnvDumpCommand(["sh", "-c", "exec env"])).toBe("env");
    expect(detectEnvDumpCommand(["bash", "-c", "command env"])).toBe("env");
    expect(detectEnvDumpCommand(["bash", "-c", "command -p printenv"])).toBe("printenv");
    expect(detectEnvDumpCommand(["bash", "-c", "command -- env"])).toBe("env");
    expect(detectEnvDumpCommand(["zsh", "-c", "builtin set"])).toBe("set");
  });

  test("blocks absolute and relative env paths", () => {
    expect(detectEnvDumpCommand(["sh", "-c", "/usr/local/bin/env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "/opt/homebrew/bin/env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "/usr/local/bin/printenv"])).toBe("printenv");
    expect(detectEnvDumpCommand(["sh", "-c", "./env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "../usr/bin/env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "./bin/printenv"])).toBe("printenv");
  });

  test("blocks alternate shell env-listing builtins", () => {
    expect(detectEnvDumpCommand(["bash", "-c", "export -p"])).toBe("export -p");
    expect(detectEnvDumpCommand(["bash", "-c", "declare -px"])).toBe("declare");
    expect(detectEnvDumpCommand(["bash", "-c", "declare -x"])).toBe("declare");
    expect(detectEnvDumpCommand(["zsh", "-c", "typeset -x"])).toBe("typeset -x");
    expect(detectEnvDumpCommand(["bash", "-c", "compgen -e"])).toBe("compgen -e");
  });

  test("blocks procfs environ paths", () => {
    expect(detectEnvDumpCommand(["sh", "-c", "cat /proc/self/environ"])).toBe("/proc/*/environ");
    expect(detectEnvDumpCommand(["sh", "-c", "tr '\\0' '\\n' < /proc/1/environ"])).toBe(
      "/proc/*/environ",
    );
  });

  test("blocks process wrappers around env/printenv", () => {
    expect(detectEnvDumpCommand(["nice", "env"])).toBe("env");
    expect(detectEnvDumpCommand(["nice", "-n", "10", "printenv"])).toBe("printenv");
    expect(detectEnvDumpCommand(["stdbuf", "-o0", "env"])).toBe("env");
    expect(detectEnvDumpCommand(["busybox", "env"])).toBe("env");
    expect(detectEnvDumpCommand(["busybox", "printenv"])).toBe("printenv");
    expect(detectEnvDumpCommand(["nice", "env", "FOO=bar", "echo", "ok"])).toBeNull();
    // Inside shell -c (MCP common shape) — not only argv[0]
    expect(detectEnvDumpCommand(["sh", "-c", "nice env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "stdbuf -o0 env"])).toBe("env");
    expect(detectEnvDumpCommand(["sh", "-c", "busybox env"])).toBe("env");
    expect(detectEnvDumpCommand(["bash", "-c", "nice -n 10 printenv"])).toBe("printenv");
  });

  test("blocks PowerShell -EncodedCommand without decoding", () => {
    // Opaque base64 body — refuse entirely unless server config opts in.
    expect(
      detectEnvDumpCommand([
        "pwsh",
        "-EncodedCommand",
        "RwBlAHQALQBDAGgAaQBsAGQASQB0AGUAbQAgAEUAbgB2ADoA",
      ]),
    ).toBe("PowerShell -EncodedCommand");
    expect(detectEnvDumpCommand(["powershell", "-enc", "QQA="])).toBe("PowerShell -EncodedCommand");
    expect(() =>
      assertEnvDumpAllowed(["pwsh", "-EncodedCommand", "QQA="], {
        [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "true",
      }),
    ).not.toThrow();
  });

  test("blocks high-signal interpreter environ dumps", () => {
    expect(detectEnvDumpCommand(["node", "-e", "console.log(process.env)"])).toBe(
      "interpreter process.env",
    );
    expect(detectEnvDumpCommand(["node", "-p", "process.env"])).toBe("interpreter process.env");
    expect(detectEnvDumpCommand(["node", "--eval", "JSON.stringify(process.env)"])).toBe(
      "interpreter process.env",
    );
    expect(detectEnvDumpCommand(["bun", "-e", "console.dir(Bun.env)"])).toBe(
      "interpreter process.env",
    );
    expect(detectEnvDumpCommand(["deno", "eval", "console.log(Deno.env.toObject())"])).toBe(
      "interpreter process.env",
    );
    expect(detectEnvDumpCommand(["python3", "-c", "print(os.environ)"])).toBe(
      "interpreter os.environ",
    );
    expect(detectEnvDumpCommand(["python", "-c", "print(dict(os.environ))"])).toBe(
      "interpreter os.environ",
    );
    expect(detectEnvDumpCommand(["ruby", "-e", "p ENV"])).toBe("interpreter ENV");
    expect(detectEnvDumpCommand(["perl", "-e", "print %ENV"])).toBe("interpreter %ENV");
    expect(detectEnvDumpCommand(["php", "-r", "print_r($_ENV);"])).toBe("interpreter $_ENV");
    expect(detectEnvDumpCommand(["sh", "-c", 'node -e "console.log(process.env)"'])).toBe(
      "interpreter process.env",
    );
    expect(detectEnvDumpCommand(["bash", "-c", "python3 -c 'print(os.environ)'"])).toBe(
      "interpreter os.environ",
    );
  });

  test("allows ordinary commands", () => {
    expect(detectEnvDumpCommand(["npm", "test"])).toBeNull();
    expect(detectEnvDumpCommand(["bun", "run", "build"])).toBeNull();
    expect(detectEnvDumpCommand(["sh", "-c", "echo $HOME"])).toBeNull();
    expect(detectEnvDumpCommand(["sh", "-c", "echo environment"])).toBeNull();
    expect(detectEnvDumpCommand(["bash", "-c", "declare -i x=1"])).toBeNull();
    // Single-key reads and normal app entrypoints are not dump idioms.
    expect(detectEnvDumpCommand(["node", "-e", "console.log(process.env.NODE_ENV)"])).toBeNull();
    expect(detectEnvDumpCommand(["python3", "-c", "print(os.environ.get('HOME'))"])).toBeNull();
    expect(detectEnvDumpCommand(["node", "server.js"])).toBeNull();
    expect(detectEnvDumpCommand(["python3", "app.py"])).toBeNull();
    expect(detectEnvDumpCommand(["sh", "-c", "echo process.env"])).toBeNull();
  });

  test("assertEnvDumpAllowed opts in only via server config env", () => {
    expect(() => assertEnvDumpAllowed(["env"], {})).toThrow(EnvDumpBlockedError);
    expect(() =>
      assertEnvDumpAllowed(["env"], { [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "false" }),
    ).toThrow(EnvDumpBlockedError);
    expect(() =>
      assertEnvDumpAllowed(["env"], { [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "" }),
    ).toThrow(EnvDumpBlockedError);
    // A leftover tool-arg shaped key must not unlock dumps by itself.
    expect(() => assertEnvDumpAllowed(["env"], { allowDangerousEnvDump: "true" })).toThrow(
      EnvDumpBlockedError,
    );
    expect(() =>
      assertEnvDumpAllowed(["env"], { [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "true" }),
    ).not.toThrow();
    expect(() =>
      assertEnvDumpAllowed(["sh", "-c", "export -p"], {
        [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "1",
      }),
    ).not.toThrow();
    expect(() =>
      assertEnvDumpAllowed(["node", "-e", "console.log(process.env)"], {
        [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "yes",
      }),
    ).not.toThrow();
  });

  test("isDangerousEnvDumpAllowed is fail-secure", () => {
    expect(isDangerousEnvDumpAllowed({})).toBe(false);
    expect(isDangerousEnvDumpAllowed({ [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "false" })).toBe(
      false,
    );
    expect(isDangerousEnvDumpAllowed({ [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "true" })).toBe(true);
  });
});

describe("buildChildEnv", () => {
  test("strips RELIC_* credentials from the parent environment", () => {
    const env = buildChildEnv(
      {
        PATH: "/usr/bin",
        NODE_ENV: "test",
        RELIC_PASSWORD: "pw",
        RELIC_API_KEY: "key",
        RELIC_SERVICE_TOKEN: "token",
        relic_project_id: "p",
        _RELIC_FROM_CLI: "true",
      },
      { API_KEY: "secret" },
    );
    expect(env).toEqual({ PATH: "/usr/bin", NODE_ENV: "test", API_KEY: "secret" });
  });

  test("secrets take precedence over the parent environment", () => {
    expect(buildChildEnv({ API_URL: "parent" }, { API_URL: "secret" })).toEqual({
      API_URL: "secret",
    });
  });
});

describe("runCommandCaptured", () => {
  const baseEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin" };

  test("redacts secrets from stdout and stderr", async () => {
    const secrets = { MY_SECRET: "super-secret-value" };
    const result = await runCommandCaptured({
      command: ["sh", "-c", 'echo "out $MY_SECRET"; echo "err $MY_SECRET" >&2'],
      env: { ...baseEnv, ...secrets },
      secrets,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("out [REDACTED:MY_SECRET]");
    expect(result.stderr).toBe("err [REDACTED:MY_SECRET]");
  });

  test("does not expose RELIC_* variables to the child", async () => {
    const env = buildChildEnv({ ...baseEnv, RELIC_PASSWORD: "hunter2hunter2" }, {});
    const result = await runCommandCaptured({
      command: ["sh", "-c", 'echo "pw=${RELIC_PASSWORD:-unset}"'],
      env,
      secrets: {},
      timeoutMs: 10_000,
    });
    expect(result.stdout).toBe("pw=unset");
  });

  test("kills the command on timeout and returns partial output", async () => {
    const result = await runCommandCaptured({
      command: ["sh", "-c", "echo started; sleep 30; echo finished"],
      env: baseEnv,
      secrets: {},
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    expect(result.stdout).toBe("started");
    expect(result.exitCode).not.toBe(0);
  });

  test("returns once the command exits even if a background process holds the pipes", async () => {
    const started = Date.now();
    const result = await runCommandCaptured({
      command: ["sh", "-c", "sleep 3 & echo done"],
      env: baseEnv,
      secrets: {},
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("done");
    expect(Date.now() - started).toBeLessThan(2_500);
  });

  test("caps captured output and never leaks a secret cut at the limit", async () => {
    const secrets = { TOKEN: "abcdefghijklmnop" };
    const result = await runCommandCaptured({
      command: [
        "sh",
        "-c",
        'i=0; while [ $i -lt 2000 ]; do printf "%s" "$TOKEN"; i=$((i+1)); done',
      ],
      env: { ...baseEnv, ...secrets },
      secrets,
      timeoutMs: 10_000,
      maxOutputChars: 1_000,
    });
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.endsWith("... (truncated)")).toBe(true);
    expect(result.stdout.length).toBeLessThan(1_100);
    expect(result.stdout).not.toContain("abcd");
  });
});
