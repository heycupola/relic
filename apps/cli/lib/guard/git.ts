export class GitError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface GitResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

export async function runGit(
  args: string[],
  options: { cwd: string; input?: string; allowFailure?: boolean },
): Promise<GitResult> {
  const proc = Bun.spawn(["git", "-c", "core.quotePath=false", ...args], {
    cwd: options.cwd,
    stdin: options.input !== undefined ? Buffer.from(options.input) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 && !options.allowFailure) {
    throw new GitError(
      `git ${args[0]} failed: ${stderr.trim() || `exit code ${exitCode}`}`,
      stderr,
    );
  }

  return { stdout: Buffer.from(stdout), stderr, exitCode };
}

export async function gitText(args: string[], cwd: string): Promise<string> {
  const { stdout } = await runGit(args, { cwd });
  return stdout.toString("utf-8");
}

export function splitNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}

export async function findRepoRoot(cwd: string): Promise<string | null> {
  const result = await runGit(["rev-parse", "--show-toplevel"], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return null;
  return result.stdout.toString("utf-8").trim();
}

export async function getGitConfig(cwd: string, key: string): Promise<string | null> {
  const result = await runGit(["config", "--get", key], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return null;
  return result.stdout.toString("utf-8").trim() || null;
}

export async function getHooksDir(cwd: string): Promise<string> {
  return (
    await gitText(["rev-parse", "--path-format=absolute", "--git-path", "hooks"], cwd)
  ).trim();
}

export interface BlobInfo {
  sha: string;
  size: number;
  content: Buffer | null;
}

/**
 * Reads blobs through a single `git cat-file --batch` process. Blobs larger than
 * `maxBytes` are reported with `content: null` and never loaded.
 */
export async function readBlobs(
  cwd: string,
  shas: string[],
  maxBytes: number,
): Promise<Map<string, BlobInfo>> {
  const blobs = new Map<string, BlobInfo>();
  if (shas.length === 0) return blobs;

  const unique = [...new Set(shas)];
  const check = await runGit(["cat-file", "--batch-check"], {
    cwd,
    input: `${unique.join("\n")}\n`,
  });

  const toRead: string[] = [];
  for (const line of check.stdout.toString("utf-8").split("\n")) {
    const [sha, type, size] = line.split(" ");
    if (!sha || type !== "blob" || size === undefined) continue;
    const bytes = Number(size);
    if (bytes > maxBytes) {
      blobs.set(sha, { sha, size: bytes, content: null });
    } else {
      toRead.push(sha);
    }
  }

  if (toRead.length === 0) return blobs;

  const { stdout } = await runGit(["cat-file", "--batch"], {
    cwd,
    input: `${toRead.join("\n")}\n`,
  });

  let offset = 0;
  while (offset < stdout.length) {
    const headerEnd = stdout.indexOf(0x0a, offset);
    if (headerEnd === -1) break;
    const [sha, , size] = stdout.subarray(offset, headerEnd).toString("utf-8").split(" ");
    const bytes = Number(size);
    const start = headerEnd + 1;
    if (sha) {
      blobs.set(sha, { sha, size: bytes, content: stdout.subarray(start, start + bytes) });
    }
    offset = start + bytes + 1;
  }

  return blobs;
}
