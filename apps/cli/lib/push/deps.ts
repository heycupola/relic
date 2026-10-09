import { homedir } from "node:os";
import type { ExecFn, PushDeps } from "./types";

export const exec: ExecFn = async (command, args, options = {}) => {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdin: options.input !== undefined ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (options.input !== undefined && proc.stdin) {
    proc.stdin.write(options.input);
    await proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
};

async function readFile(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return await file.text();
  } catch {
    return null;
  }
}

export function createDefaultDeps(): PushDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    exec,
    which: (command) => Bun.which(command),
    readFile,
    exists: (path) => Bun.file(path).exists(),
    env: process.env,
    cwd: process.cwd(),
    homedir: homedir(),
    platform: process.platform,
  };
}
