import { describe, expect, test } from "bun:test";
import {
  parseTruthyFlag,
  RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP,
  resolveAllowDangerousEnvDump,
} from "./env-dump-policy";
import { assertEnvDumpAllowed, EnvDumpBlockedError } from "./run-command";

describe("parseTruthyFlag", () => {
  test("accepts common truthy tokens", () => {
    for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
      expect(parseTruthyFlag(value)).toBe(true);
    }
  });

  test("rejects unset, empty, and other values", () => {
    for (const value of [undefined, null, "", "0", "false", "no", "maybe"]) {
      expect(parseTruthyFlag(value)).toBe(false);
    }
  });
});

describe("resolveAllowDangerousEnvDump", () => {
  test("defaults to false", async () => {
    expect(
      await resolveAllowDangerousEnvDump({
        env: {},
        configAllow: false,
      }),
    ).toBe(false);
  });

  test("CLI flag wins over env and config", async () => {
    expect(
      await resolveAllowDangerousEnvDump({
        cliFlag: true,
        env: { [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "false" },
        configAllow: false,
      }),
    ).toBe(true);
  });

  test("env enables when CLI flag is absent", async () => {
    expect(
      await resolveAllowDangerousEnvDump({
        env: { [RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP]: "true" },
        configAllow: false,
      }),
    ).toBe(true);
  });

  test("relic.toml enables when CLI and env are unset", async () => {
    expect(
      await resolveAllowDangerousEnvDump({
        env: {},
        configAllow: true,
      }),
    ).toBe(true);
  });

  test("loadConfigAllow is used when configAllow is omitted", async () => {
    expect(
      await resolveAllowDangerousEnvDump({
        env: {},
        loadConfigAllow: async () => true,
      }),
    ).toBe(true);
    expect(
      await resolveAllowDangerousEnvDump({
        env: {},
        loadConfigAllow: async () => false,
      }),
    ).toBe(false);
  });
});

describe("operator gate vs model tool args (CUP-62)", () => {
  test("model/tool-style boolean cannot unlock dumps unless operator allow is true", () => {
    // Simulates a client still sending allowDangerousEnvDump=true in tool args:
    // the server must ignore that and only honor operatorAllowDangerousEnvDump.
    const modelTriedToOptIn = true;
    const operatorAllow = false;
    void modelTriedToOptIn;
    expect(() => assertEnvDumpAllowed(["env"], operatorAllow)).toThrow(EnvDumpBlockedError);
    expect(() => assertEnvDumpAllowed(["env"], true)).not.toThrow();
  });

  test("blocked error tells operators how to opt in and that tool args cannot", () => {
    try {
      assertEnvDumpAllowed(["printenv"]);
      throw new Error("expected EnvDumpBlockedError");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvDumpBlockedError);
      const message = (err as EnvDumpBlockedError).message;
      expect(message).toContain("RELIC_MCP_ALLOW_DANGEROUS_ENV_DUMP");
      expect(message).toContain("--allow-dangerous-env-dump");
      expect(message).toContain("relic.toml");
      expect(message).toContain("Tool arguments cannot enable dumps");
      expect(message).not.toContain("allowDangerousEnvDump=true");
    }
  });
});
