import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as auth from "@repo/auth";
import * as apiModule from "../lib/api";
import type { ProjectRotationStatus, SecretRotationEntry } from "../lib/api";
import {
  buildRotationJson,
  findEnvironment,
  formatRotationTable,
  getRotationExitCode,
  parseRotationDays,
  rotationSet,
  rotationStatus,
  summarizeRotation,
} from "./rotation";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);

function entry(overrides: Partial<SecretRotationEntry>): SecretRotationEntry {
  return {
    secretId: "secret_1",
    key: "API_KEY",
    environmentId: "env_1",
    environmentName: "production",
    folderId: null,
    folderName: null,
    valueChangedAt: NOW - 10 * DAY_MS,
    ageDays: 10,
    rotateEveryDays: 90,
    policySource: "environment",
    status: "ok",
    dueAt: NOW + 80 * DAY_MS,
    daysUntilDue: 80,
    ...overrides,
  };
}

const ENTRIES: SecretRotationEntry[] = [
  entry({ key: "STRIPE_KEY", ageDays: 412, status: "overdue", policySource: "secret" }),
  entry({ key: "DB_URL", ageDays: 80, status: "due_soon", folderName: "db" }),
  entry({ key: "API_KEY" }),
  entry({
    key: "FEATURE_FLAG",
    status: "no_policy",
    rotateEveryDays: null,
    policySource: null,
    dueAt: null,
    daysUntilDue: null,
  }),
];

describe("parseRotationDays", () => {
  test("accepts whole days in range", () => {
    expect(parseRotationDays("90")).toBe(90);
    expect(parseRotationDays(" 1 ")).toBe(1);
    expect(parseRotationDays("3650")).toBe(3650);
  });

  test("rejects invalid values", () => {
    for (const input of ["0", "-1", "1.5", "abc", "", "3651", "90d"]) {
      expect(() => parseRotationDays(input)).toThrow("--every must be");
    }
  });
});

describe("rotation report helpers", () => {
  test("summarizes statuses", () => {
    expect(summarizeRotation(ENTRIES)).toEqual({
      total: 4,
      ok: 1,
      dueSoon: 1,
      overdue: 1,
      noPolicy: 1,
    });
  });

  test("fails only when asked and something is overdue", () => {
    expect(getRotationExitCode(ENTRIES)).toBe(0);
    expect(getRotationExitCode(ENTRIES, true)).toBe(1);
    expect(
      getRotationExitCode(
        ENTRIES.filter((e) => e.status !== "overdue"),
        true,
      ),
    ).toBe(0);
  });

  test("builds JSON with ISO timestamps and no values", () => {
    const json = buildRotationJson({
      projectId: "proj_1",
      projectName: "app",
      generatedAt: NOW,
      secrets: ENTRIES,
    });

    expect(json.generatedAt).toBe(new Date(NOW).toISOString());
    expect(json.summary.overdue).toBe(1);
    expect(json.secrets[0]).toEqual({
      key: "STRIPE_KEY",
      environment: "production",
      folder: null,
      ageDays: 412,
      valueChangedAt: new Date(NOW - 10 * DAY_MS).toISOString(),
      rotateEveryDays: 90,
      policySource: "secret",
      status: "overdue",
      dueAt: new Date(NOW + 80 * DAY_MS).toISOString(),
    });
    expect(json.secrets[3]?.dueAt).toBeNull();
    expect(JSON.stringify(json)).not.toContain("encryptedValue");
  });

  test("formats a table with folder paths, policy source, and status labels", () => {
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");
    const lines = formatRotationTable(ENTRIES).map((line) => line.replace(ansi, ""));

    expect(lines[0]).toContain("KEY");
    expect(lines[0]).toContain("STATUS");
    expect(lines.find((l) => l.includes("STRIPE_KEY"))).toMatch(/412d\s+90d\s+overdue/);
    expect(lines.find((l) => l.includes("db/DB_URL"))).toMatch(/80d\s+90d \(env\)\s+due soon/);
    expect(lines.find((l) => l.includes("FEATURE_FLAG"))).toMatch(/-\s+no policy/);
  });

  test("matches environments by name or slug, case-insensitively", () => {
    const environments = [
      { id: "1", name: "Production", slug: "production", projectId: "p" },
      { id: "2", name: "Staging EU", slug: "staging-eu", projectId: "p" },
    ];

    expect(findEnvironment(environments, "production")?.id).toBe("1");
    expect(findEnvironment(environments, "STAGING EU")?.id).toBe("2");
    expect(findEnvironment(environments, "staging-eu")?.id).toBe("2");
    expect(findEnvironment(environments, "dev")).toBeUndefined();
  });
});

describe("rotation commands", () => {
  const status: ProjectRotationStatus = {
    projectId: "proj_1",
    projectName: "app",
    generatedAt: NOW,
    secrets: ENTRIES,
  };

  let fakeApi: Record<string, ReturnType<typeof spyOn> | ((...args: unknown[]) => unknown)>;
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;
  let sessionSpy: ReturnType<typeof spyOn>;
  let getApiSpy: ReturnType<typeof spyOn>;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    fakeApi = {
      getRotationStatus: async () => status,
      getProjectEnvironments: async () => [
        { id: "env_1", name: "production", slug: "production", projectId: "proj_1" },
      ],
      getEnvironmentData: async () => ({
        folders: [{ id: "folder_1", name: "db", environmentId: "env_1" }],
        secrets: [
          { id: "secret_root", key: "DB_URL", environmentId: "env_1" },
          { id: "secret_db", key: "DB_URL", environmentId: "env_1", folderId: "folder_1" },
        ],
      }),
      setSecretRotationPolicy: async () => ({ success: true }),
      setEnvironmentRotationPolicy: async () => ({ success: true }),
    };
    for (const name of Object.keys(fakeApi)) {
      fakeApi[name] = spyOn(fakeApi as Record<string, () => unknown>, name);
    }

    sessionSpy = spyOn(auth, "validateSession").mockResolvedValue({
      isValid: true,
      isExpired: false,
    } as Awaited<ReturnType<typeof auth.validateSession>>);
    getApiSpy = spyOn(apiModule, "getApi").mockReturnValue(
      fakeApi as unknown as apiModule.ProtectedApi,
    );
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    process.env.RELIC_PROJECT_ID = "proj_1";
  });

  afterEach(() => {
    sessionSpy.mockRestore();
    getApiSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    process.exitCode = originalExitCode;
    delete process.env.RELIC_PROJECT_ID;
  });

  test("status --json prints a parseable report and exits 1 with --fail-on-overdue", async () => {
    await rotationStatus({ json: true, failOnOverdue: true });

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.summary).toEqual({ total: 4, ok: 1, dueSoon: 1, overdue: 1, noPolicy: 1 });
    expect(process.exitCode).toBe(1);
  });

  test("status exits 0 without --fail-on-overdue", async () => {
    await rotationStatus({});
    expect(process.exitCode).toBe(0);
  });

  test("status resolves the environment filter", async () => {
    await rotationStatus({ environment: "Production" });
    expect(fakeApi.getRotationStatus).toHaveBeenCalledWith("proj_1", "env_1");
  });

  test("status uses RELIC_SERVICE_TOKEN without a session", async () => {
    const serviceSpy = spyOn(apiModule, "getRotationStatusViaServiceToken").mockResolvedValue(
      status,
    );
    process.env.RELIC_SERVICE_TOKEN = "rsk_test";
    process.env.RELIC_OIDC_TOKEN = "oidc_test";
    try {
      await rotationStatus({ environment: "production", failOnOverdue: true });

      expect(serviceSpy).toHaveBeenCalledWith(
        "rsk_test",
        { environmentName: "production" },
        "oidc_test",
      );
      expect(sessionSpy).not.toHaveBeenCalled();
      expect(fakeApi.getRotationStatus).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    } finally {
      serviceSpy.mockRestore();
      delete process.env.RELIC_SERVICE_TOKEN;
      delete process.env.RELIC_OIDC_TOKEN;
    }
  });

  test("set targets a secret inside a folder", async () => {
    await rotationSet("DB_URL", { every: "30", environment: "production", folder: "db" });
    expect(fakeApi.setSecretRotationPolicy).toHaveBeenCalledWith("secret_db", 30);
  });

  test("set without a key targets the environment", async () => {
    await rotationSet(undefined, { every: "90", environment: "production" });
    expect(fakeApi.setEnvironmentRotationPolicy).toHaveBeenCalledWith("env_1", 90);
    expect(fakeApi.setSecretRotationPolicy).not.toHaveBeenCalled();
  });

  test("set rejects an invalid interval before calling the API", async () => {
    await expect(rotationSet("DB_URL", { every: "0", environment: "production" })).rejects.toThrow(
      "process.exit",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fakeApi.setSecretRotationPolicy).not.toHaveBeenCalled();
  });
});
