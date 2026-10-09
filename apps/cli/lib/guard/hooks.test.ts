import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getHooksDir } from "./git";
import {
  addGuardToLefthook,
  detectHookManager,
  GUARD_HOOK_COMMAND,
  installGitHook,
  removeGuardFromLefthook,
  uninstallGitHook,
} from "./hooks";
import { createTempRepo, type TempRepo } from "./test-repo";

async function runHook(repo: TempRepo, hookPath: string, path: string) {
  const proc = Bun.spawn(["sh", hookPath], {
    cwd: repo.dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: path },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

describe("git pre-commit hook", () => {
  let repo: TempRepo;
  let hooksDir: string;

  beforeEach(async () => {
    repo = await createTempRepo();
    hooksDir = await getHooksDir(repo.dir);
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("installs an executable hook and uninstalls it", async () => {
    expect(await installGitHook(hooksDir)).toBe("installed");
    const hookPath = join(hooksDir, "pre-commit");
    const script = await readFile(hookPath, "utf-8");
    expect(script).toContain(GUARD_HOOK_COMMAND);
    expect((await stat(hookPath)).mode & 0o111).not.toBe(0);

    expect(await installGitHook(hooksDir)).toBe("already-installed");
    expect(await uninstallGitHook(hooksDir)).toBe("removed");
    expect(await stat(hookPath).catch(() => null)).toBeNull();
    expect(await uninstallGitHook(hooksDir)).toBe("not-installed");
  });

  test("chains an existing hook instead of overwriting it", async () => {
    await mkdir(hooksDir, { recursive: true });
    const original = "#!/bin/sh\necho original-hook\n";
    await writeFile(join(hooksDir, "pre-commit"), original, { mode: 0o755 });

    expect(await installGitHook(hooksDir)).toBe("chained");
    expect(await readFile(join(hooksDir, "pre-commit.pre-relic"), "utf-8")).toBe(original);

    expect(await uninstallGitHook(hooksDir)).toBe("restored");
    expect(await readFile(join(hooksDir, "pre-commit"), "utf-8")).toBe(original);
    expect(await stat(join(hooksDir, "pre-commit.pre-relic")).catch(() => null)).toBeNull();
  });

  test("runs the chained hook first and stops when it fails", async () => {
    const bin = join(repo.dir, ".bin");
    await mkdir(bin);
    await writeFile(join(bin, "relic"), '#!/bin/sh\necho relic-ran "$@"\n', { mode: 0o755 });
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, "pre-commit"), "#!/bin/sh\necho chained-ran\n", {
      mode: 0o755,
    });
    await installGitHook(hooksDir);

    const pass = await runHook(repo, join(hooksDir, "pre-commit"), `${bin}:/usr/bin:/bin`);
    expect(pass.code).toBe(0);
    expect(pass.stdout).toBe("chained-ran\nrelic-ran guard scan --staged\n");

    await writeFile(join(hooksDir, "pre-commit.pre-relic"), "#!/bin/sh\nexit 3\n", {
      mode: 0o755,
    });
    const fail = await runHook(repo, join(hooksDir, "pre-commit"), `${bin}:/usr/bin:/bin`);
    expect(fail.code).toBe(3);
    expect(fail.stdout).toBe("");
  });

  test("warns and lets the commit through when relic is not on PATH", async () => {
    await installGitHook(hooksDir);
    const result = await runHook(repo, join(hooksDir, "pre-commit"), "/usr/bin:/bin");
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("relic is not on PATH");
  });
});

describe("detectHookManager", () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("returns null for a plain repository", async () => {
    expect(await detectHookManager(repo.dir)).toBeNull();
  });

  test("detects lefthook, husky, pre-commit, and custom hooksPath", async () => {
    await repo.git("config", "core.hooksPath", "tools/hooks");
    expect((await detectHookManager(repo.dir))?.manager).toBe("hooks-path");

    await repo.write(".pre-commit-config.yaml", "repos: []\n");
    expect((await detectHookManager(repo.dir))?.manager).toBe("pre-commit");

    await repo.write(".husky/pre-commit", "npm test\n");
    expect((await detectHookManager(repo.dir))?.manager).toBe("husky");

    await repo.write("lefthook.yml", "pre-commit:\n");
    expect(await detectHookManager(repo.dir)).toEqual({
      manager: "lefthook",
      configPath: "lefthook.yml",
    });
  });
});

describe("lefthook config editing", () => {
  test("adds the command under existing pre-commit commands", () => {
    const before = [
      "pre-commit:",
      "  parallel: true",
      "  commands:",
      "    oxlint:",
      "      run: bunx oxlint {staged_files}",
      "",
      "pre-push:",
      "  commands:",
      "    test:",
      "      run: bun test",
      "",
    ].join("\n");

    const after = addGuardToLefthook(before);
    expect(after).toBe(
      [
        "pre-commit:",
        "  parallel: true",
        "  commands:",
        "    relic-guard:",
        `      run: ${GUARD_HOOK_COMMAND}`,
        "    oxlint:",
        "      run: bunx oxlint {staged_files}",
        "",
        "pre-push:",
        "  commands:",
        "    test:",
        "      run: bun test",
        "",
      ].join("\n"),
    );
    expect(removeGuardFromLefthook(after!)).toBe(before);
  });

  test("respects four-space indentation", () => {
    const before = "pre-commit:\n    commands:\n        lint:\n            run: lint\n";
    expect(addGuardToLefthook(before)).toBe(
      `pre-commit:\n    commands:\n        relic-guard:\n            run: ${GUARD_HOOK_COMMAND}\n        lint:\n            run: lint\n`,
    );
  });

  test("appends a pre-commit block when there is none, and removes it cleanly", () => {
    const before = "pre-push:\n  commands:\n    test:\n      run: bun test\n";
    const after = addGuardToLefthook(before)!;
    expect(after).toContain(
      `pre-commit:\n  commands:\n    relic-guard:\n      run: ${GUARD_HOOK_COMMAND}\n`,
    );
    expect(removeGuardFromLefthook(after).trimEnd()).toBe(before.trimEnd());
  });

  test("adds a commands key to a pre-commit block without one", () => {
    const before = "pre-commit:\n  parallel: true\n";
    expect(addGuardToLefthook(before)).toBe(
      `pre-commit:\n  commands:\n    relic-guard:\n      run: ${GUARD_HOOK_COMMAND}\n  parallel: true\n`,
    );
  });

  test("refuses layouts it can't edit safely", () => {
    expect(addGuardToLefthook("pre-commit:\n  jobs:\n    - run: lint\n")).toBeNull();
    expect(addGuardToLefthook("pre-commit: { commands: {} }\n")).toBeNull();
  });

  test("is a no-op when the guard is already configured", () => {
    const content = `pre-commit:\n  commands:\n    leaks:\n      run: ${GUARD_HOOK_COMMAND}\n`;
    expect(addGuardToLefthook(content)).toBe(content);
  });
});
