import { describe, expect, mock, test } from "bun:test";
import {
  type ExecResult,
  ImportSourceError,
  readImportSource,
  resolveSourceKind,
  type SourceDeps,
  type SourceOptions,
} from "./import-sources";

const OPTIONS: SourceOptions = { environment: "production" };

function createDeps(overrides: Partial<SourceDeps> = {}): SourceDeps {
  return {
    exec: mock(() => Promise.resolve({ exitCode: 0, stdout: "{}", stderr: "" })),
    fetch: mock(() => Promise.resolve(new Response("{}"))),
    readFile: mock(() => Promise.resolve(null)),
    readStdin: mock(() => Promise.resolve("")),
    stdinIsTTY: false,
    env: {},
    cwd: "/project",
    home: "/home/dev",
    platform: "linux",
    ...overrides,
  };
}

function files(map: Record<string, string>) {
  return mock((path: string) => Promise.resolve(map[path] ?? null));
}

function fetchReturning(respond: (url: string) => Response) {
  return mock((url: string, _init?: RequestInit) => Promise.resolve(respond(url)));
}

function execReturning(result: Partial<ExecResult>) {
  return mock((_cmd: string[]) =>
    Promise.resolve({ exitCode: 0, stdout: "", stderr: "", ...result }),
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("resolveSourceKind", () => {
  test("maps arguments to source kinds", () => {
    expect(resolveSourceKind(undefined)).toBe("file");
    expect(resolveSourceKind("-")).toBe("stdin");
    expect(resolveSourceKind("doppler")).toBe("doppler");
    expect(resolveSourceKind("op")).toBe("1password");
    expect(resolveSourceKind("./doppler")).toBe("file");
    expect(resolveSourceKind("secrets.json")).toBe("file");
  });
});

describe("file sources", () => {
  test("defaults to .env in the working directory", async () => {
    const deps = createDeps({
      readFile: files({ "/project/.env": "export API_KEY='abc'\nPORT=3000 # web" }),
    });
    const result = await readImportSource(undefined, OPTIONS, deps);
    expect(result.kind).toBe("file");
    expect(result.format).toBe("env");
    expect(result.filePath).toBe("/project/.env");
    expect(result.items).toEqual([
      { key: "API_KEY", value: "abc", type: "string" },
      { key: "PORT", value: "3000", type: "number" },
    ]);
  });

  test("parses .json files in the TUI format", async () => {
    const deps = createDeps({
      readFile: files({
        "/project/secrets.json": '[{ "key": "A", "value": "1", "scope": "client" }]',
      }),
    });
    const result = await readImportSource("secrets.json", OPTIONS, deps);
    expect(result.format).toBe("json");
    expect(result.items).toEqual([{ key: "A", value: "1", scope: "client" }]);
  });

  test("sniffs JSON content in files without a .json extension", async () => {
    const deps = createDeps({ readFile: files({ "/project/export.txt": '{ "A": "x" }' }) });
    const result = await readImportSource("export.txt", OPTIONS, deps);
    expect(result.format).toBe("json");
  });

  test("respects --format", async () => {
    const deps = createDeps({ readFile: files({ "/project/data.json": "A=1" }) });
    const result = await readImportSource("data.json", { ...OPTIONS, format: "env" }, deps);
    expect(result.items).toEqual([{ key: "A", value: "1", type: "number" }]);
  });

  test("fails when the file is missing", async () => {
    await expect(readImportSource(".env.local", OPTIONS, createDeps())).rejects.toThrow(
      "File not found: .env.local",
    );
  });

  test("does not leak values from invalid JSON", async () => {
    const deps = createDeps({
      readFile: files({ "/project/broken.json": '{ "A": "hunter2" ' }),
    });
    const error = await readImportSource("broken.json", OPTIONS, deps).catch((e) => e);
    expect(error).toBeInstanceOf(ImportSourceError);
    expect(error.message).not.toContain("hunter2");
  });
});

describe("stdin source", () => {
  test("reads and auto-detects JSON", async () => {
    const deps = createDeps({ readStdin: mock(() => Promise.resolve('{ "TOKEN": "t" }')) });
    const result = await readImportSource("-", OPTIONS, deps);
    expect(result.kind).toBe("stdin");
    expect(result.format).toBe("json");
    expect(result.items).toEqual([{ key: "TOKEN", value: "t", type: "string" }]);
  });

  test("reads dotenv content", async () => {
    const deps = createDeps({ readStdin: mock(() => Promise.resolve("A=1\nB=2")) });
    const result = await readImportSource("-", { ...OPTIONS, format: "env" }, deps);
    expect(result.items).toHaveLength(2);
  });

  test("refuses to read from an interactive terminal", async () => {
    const deps = createDeps({ stdinIsTTY: true });
    await expect(readImportSource("-", OPTIONS, deps)).rejects.toThrow("Pipe secrets");
  });
});

describe("doppler source", () => {
  test("downloads secrets and drops DOPPLER_ metadata", async () => {
    const exec = execReturning({
      stdout: JSON.stringify({
        API_KEY: "abc",
        DOPPLER_PROJECT: "web",
        DOPPLER_CONFIG: "prd",
        DOPPLER_ENVIRONMENT: "prd",
      }),
    });
    const result = await readImportSource(
      "doppler",
      { ...OPTIONS, dopplerProject: "web", dopplerConfig: "prd" },
      createDeps({ exec }),
    );

    expect(exec).toHaveBeenCalledWith([
      "doppler",
      "secrets",
      "download",
      "--no-file",
      "--format",
      "json",
      "--project",
      "web",
      "--config",
      "prd",
    ]);
    expect(result.label).toBe("Doppler (web/prd)");
    expect(result.items).toEqual([{ key: "API_KEY", value: "abc", type: "string" }]);
    expect(result.skipped.map((s) => s.key)).toEqual([
      "DOPPLER_PROJECT",
      "DOPPLER_CONFIG",
      "DOPPLER_ENVIRONMENT",
    ]);
  });

  test("reports CLI failures with stderr", async () => {
    const exec = execReturning({ exitCode: 1, stderr: "Unable to fetch secrets" });
    await expect(readImportSource("doppler", OPTIONS, createDeps({ exec }))).rejects.toThrow(
      "Doppler CLI exited with code 1: Unable to fetch secrets",
    );
  });

  test("explains how to install a missing CLI", async () => {
    const exec = mock(() => Promise.reject(new Error("ENOENT")));
    await expect(readImportSource("doppler", OPTIONS, createDeps({ exec }))).rejects.toThrow(
      "Could not run the Doppler CLI",
    );
  });
});

describe("infisical source", () => {
  test("exports JSON and passes env, path, and project flags", async () => {
    const exec = execReturning({
      stdout: JSON.stringify([
        { key: "DB_URL", value: "personal", type: "personal" },
        { key: "DB_URL", value: "shared", type: "shared" },
        { key: "PORT", value: "8080", type: "shared" },
      ]),
    });
    const result = await readImportSource(
      "infisical",
      { ...OPTIONS, infisicalEnv: "prod", infisicalPath: "/api", infisicalProject: "p1" },
      createDeps({ exec }),
    );

    expect(exec).toHaveBeenCalledWith([
      "infisical",
      "export",
      "--format=json",
      "--silent",
      "--env=prod",
      "--path=/api",
      "--projectId=p1",
    ]);
    expect(result.items).toEqual([
      { key: "DB_URL", value: "shared", type: "string" },
      { key: "PORT", value: "8080", type: "number" },
    ]);
  });

  test("rejects non-array output", async () => {
    const exec = execReturning({ stdout: "{}" });
    await expect(readImportSource("infisical", OPTIONS, createDeps({ exec }))).rejects.toThrow(
      "unexpected JSON shape",
    );
  });
});

describe("vercel source", () => {
  const ENVS = {
    envs: [
      { id: "1", key: "API_URL", value: "https://api", type: "plain", target: ["production"] },
      {
        id: "2",
        key: "DB_PASSWORD",
        value: "pw",
        type: "encrypted",
        decrypted: true,
        target: ["production", "preview"],
      },
      { id: "3", key: "STRIPE_KEY", value: "", type: "sensitive", target: ["production"] },
      { id: "4", key: "DEV_ONLY", value: "x", type: "plain", target: ["development"] },
      {
        id: "5",
        key: "BRANCH_URL",
        value: "y",
        type: "plain",
        target: ["preview"],
        gitBranch: "feat",
      },
      { id: "6", key: "LEGACY", value: "enc", type: "encrypted", target: "production" },
    ],
  };

  test("reads a target with VERCEL_TOKEN and .vercel/project.json", async () => {
    const fetchMock = fetchReturning((url) =>
      url.includes("/v1/projects/") ? json({ value: "decrypted", decrypted: true }) : json(ENVS),
    );
    const deps = createDeps({
      env: { VERCEL_TOKEN: "vt" },
      fetch: fetchMock,
      readFile: files({
        "/project/.vercel/project.json": JSON.stringify({
          projectId: "prj_1",
          orgId: "team_9",
        }),
      }),
    });

    const result = await readImportSource("vercel", OPTIONS, deps);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.vercel.com/v10/projects/prj_1/env?decrypt=true&teamId=team_9",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ headers: { Authorization: "Bearer vt" } });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.vercel.com/v1/projects/prj_1/env/6?teamId=team_9",
    );
    expect(result.items).toEqual([
      { key: "API_URL", value: "https://api", type: "string" },
      { key: "DB_PASSWORD", value: "pw", type: "string" },
      { key: "LEGACY", value: "decrypted", type: "string" },
    ]);
    expect(result.skipped).toEqual([
      { key: "STRIPE_KEY", reason: "Vercel sensitive value (not readable)" },
    ]);
  });

  test("falls back to the Vercel CLI auth file and skips personal org IDs", async () => {
    const fetchMock = fetchReturning(() => json({ envs: [] }));
    const deps = createDeps({
      fetch: fetchMock,
      readFile: files({
        "/home/dev/.local/share/com.vercel.cli/auth.json": JSON.stringify({ token: "cli" }),
        "/project/.vercel/project.json": JSON.stringify({ projectId: "prj_1", orgId: "user_1" }),
      }),
    });

    await readImportSource(
      "vercel",
      { ...OPTIONS, environment: "staging", vercelTarget: "preview" },
      deps,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.vercel.com/v10/projects/prj_1/env?decrypt=true",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ headers: { Authorization: "Bearer cli" } });
  });

  test("reports branch overrides for preview", async () => {
    const deps = createDeps({
      env: { VERCEL_TOKEN: "vt", VERCEL_PROJECT_ID: "prj_1" },
      fetch: mock(() => Promise.resolve(json(ENVS))),
    });
    const result = await readImportSource("vercel", { ...OPTIONS, environment: "preview" }, deps);
    expect(result.items.map((i) => (i as { key: string }).key)).toEqual(["DB_PASSWORD"]);
    expect(result.skipped).toEqual([
      { key: "BRANCH_URL", reason: "Vercel branch override (feat)" },
    ]);
  });

  test("follows pagination", async () => {
    const fetchMock = fetchReturning((url) =>
      url.includes("until=")
        ? json({ envs: [{ key: "B", value: "2", type: "plain", target: ["production"] }] })
        : json({
            envs: [{ key: "A", value: "1", type: "plain", target: ["production"] }],
            pagination: { next: 123 },
          }),
    );
    const deps = createDeps({
      env: { VERCEL_TOKEN: "vt", VERCEL_PROJECT_ID: "prj_1" },
      fetch: fetchMock,
    });
    const result = await readImportSource("vercel", OPTIONS, deps);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("&until=123");
    expect(result.items).toHaveLength(2);
  });

  test("requires a target when the Relic environment is not a Vercel target", async () => {
    await expect(
      readImportSource("vercel", { environment: "staging" }, createDeps()),
    ).rejects.toThrow("Pass --vercel-target");
  });

  test("requires a token", async () => {
    const deps = createDeps({ env: { VERCEL_PROJECT_ID: "prj_1" } });
    await expect(readImportSource("vercel", OPTIONS, deps)).rejects.toThrow("No Vercel token");
  });

  test("explains authorization failures", async () => {
    const deps = createDeps({
      env: { VERCEL_TOKEN: "vt", VERCEL_PROJECT_ID: "prj_1" },
      fetch: mock(() => Promise.resolve(json({ error: {} }, 403))),
    });
    await expect(readImportSource("vercel", OPTIONS, deps)).rejects.toThrow("HTTP 403");
  });
});

describe("1password source", () => {
  test("maps item fields to secrets", async () => {
    const exec = execReturning({
      stdout: JSON.stringify({
        fields: [
          { label: "API_KEY", value: "abc", type: "CONCEALED" },
          { label: "username", value: "", purpose: "USERNAME" },
          { label: "notesPlain", value: "remember", purpose: "NOTES" },
          { label: "Database URL", value: "postgres://", type: "STRING" },
        ],
      }),
    });
    const result = await readImportSource(
      "1password",
      { ...OPTIONS, opItem: "web-prod", opVault: "Eng" },
      createDeps({ exec }),
    );

    expect(exec).toHaveBeenCalledWith([
      "op",
      "item",
      "get",
      "web-prod",
      "--format",
      "json",
      "--vault",
      "Eng",
    ]);
    expect(result.items).toEqual([
      { key: "API_KEY", value: "abc", type: "string" },
      { key: "Database URL", value: "postgres://", type: "string" },
    ]);
    expect(result.skipped.map((s) => s.key)).toEqual(["username", "notesPlain"]);
  });

  test("requires --op-item", async () => {
    await expect(readImportSource("1password", OPTIONS, createDeps())).rejects.toThrow("--op-item");
  });
});
