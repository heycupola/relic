import { mock } from "bun:test";
import type { ExecOptions, ExecResult, PushDeps } from "./types";

export interface ExecCall {
  command: string;
  args: string[];
  options?: ExecOptions;
}

export interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
  headers: Record<string, string>;
}

type ExecHandler = (call: ExecCall) => ExecResult | undefined;
type FetchHandler = (call: FetchCall) => { status?: number; body?: unknown } | undefined;

export function ok(stdout = ""): ExecResult {
  return { exitCode: 0, stdout, stderr: "" };
}

export function fail(stderr: string, exitCode = 1): ExecResult {
  return { exitCode, stdout: "", stderr };
}

export function createFakeDeps(
  config: {
    files?: Record<string, string>;
    binaries?: Record<string, string>;
    env?: Record<string, string | undefined>;
    exec?: ExecHandler;
    fetch?: FetchHandler;
    platform?: NodeJS.Platform;
  } = {},
) {
  const execCalls: ExecCall[] = [];
  const fetchCalls: FetchCall[] = [];
  const files = config.files ?? {};

  const deps: PushDeps = {
    fetch: mock(async (input: string | URL | Request, init?: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const call: FetchCall = {
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        headers,
      };
      fetchCalls.push(call);
      const response = config.fetch?.(call) ?? { status: 200, body: {} };
      const status = response.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(response.body ?? {}), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch,
    exec: mock(async (command: string, args: string[], options?: ExecOptions) => {
      const call = { command, args, options };
      execCalls.push(call);
      return config.exec?.(call) ?? ok();
    }),
    which: (command) => config.binaries?.[command] ?? null,
    readFile: async (path) => files[path] ?? null,
    exists: async (path) => path in files || Object.values(config.binaries ?? {}).includes(path),
    env: config.env ?? {},
    cwd: "/work",
    homedir: "/home/dev",
    platform: config.platform ?? "linux",
  };

  return { deps, execCalls, fetchCalls };
}
