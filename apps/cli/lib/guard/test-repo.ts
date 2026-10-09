import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// NOTE: keeps the developer's global git config (hooksPath, signing, templates) out of fixtures
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

export interface TempRepo {
  dir: string;
  git: (...args: string[]) => Promise<string>;
  write: (path: string, content: string | Uint8Array) => Promise<void>;
  commit: (message: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  return stdout.trim();
}

export async function createTempDir(prefix = "relic-guard-"): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

export async function createTempRepo(): Promise<TempRepo> {
  const dir = await createTempDir();
  await git(dir, ["init", "-q", "-b", "main"]);
  await git(dir, ["config", "user.email", "guard@test.dev"]);
  await git(dir, ["config", "user.name", "Guard Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);

  return {
    dir,
    git: (...args) => git(dir, args),
    write: async (path, content) => {
      const full = join(dir, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content);
    },
    commit: async (message) => {
      await git(dir, ["add", "-A"]);
      await git(dir, ["commit", "-q", "-m", message]);
      return git(dir, ["rev-parse", "HEAD"]);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
