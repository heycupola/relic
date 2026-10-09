import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { IgnoreMatcher } from "./ignore";
import { collectPathTargets, collectRangeTargets, collectStagedTargets } from "./sources";
import { createTempDir, createTempRepo, type TempRepo } from "./test-repo";

const noIgnore = new IgnoreMatcher([]);

describe("collectStagedTargets", () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("reads staged content from the index, not the working tree", async () => {
    await repo.write("config.ts", "export const key = 'staged-version';\n");
    await repo.git("add", "config.ts");
    await repo.write("config.ts", "export const key = 'working-tree-version';\n");

    const targets = await collectStagedTargets({
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });

    expect(targets.files).toEqual([{ path: "config.ts" }]);
    expect(targets.chunks).toHaveLength(1);
    expect(targets.chunks[0]!.text).toContain("staged-version");
    expect(targets.chunks[0]!.text).not.toContain("working-tree-version");
  });

  test("works before the first commit", async () => {
    await repo.write(".env", "A=1\n");
    await repo.git("add", ".env");

    const targets = await collectStagedTargets({
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });
    expect(targets.files.map((f) => f.path)).toEqual([".env"]);
  });

  test("ignores unstaged files and staged deletions", async () => {
    await repo.write("keep.ts", "a\n");
    await repo.write("gone.ts", "b\n");
    await repo.commit("init");

    await repo.git("rm", "-q", "gone.ts");
    await repo.write("untracked.ts", "c\n");
    await repo.write("keep.ts", "changed but unstaged\n");

    const targets = await collectStagedTargets({
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });
    expect(targets.files).toEqual([]);
  });

  test("skips binary, oversized, and ignored files", async () => {
    await repo.write("image.png", new Uint8Array([0x89, 0x50, 0x00, 0x01]));
    await repo.write("big.txt", "x".repeat(2048));
    await repo.write("fixtures/secret.txt", "fixture\n");
    await repo.write("ok.txt", "fine\n");
    await repo.git("add", "-A");

    const targets = await collectStagedTargets({
      root: repo.dir,
      isGitRepo: true,
      ignore: new IgnoreMatcher(["fixtures/"]),
      maxFileBytes: 1024,
    });

    expect(targets.files.map((f) => f.path).sort()).toEqual(["big.txt", "image.png", "ok.txt"]);
    expect(targets.chunks.map((c) => c.path)).toEqual(["ok.txt"]);
    expect(targets.skippedBinary).toBe(1);
    expect(targets.skippedLarge).toBe(1);
  });

  test("handles paths with spaces and unicode", async () => {
    await repo.write("dir with space/ünï.env", "X=1\n");
    await repo.git("add", "-A");

    const targets = await collectStagedTargets({
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });
    expect(targets.files).toEqual([{ path: "dir with space/ünï.env" }]);
  });
});

describe("collectRangeTargets", () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  test("collects only added lines with their line numbers, per commit", async () => {
    await repo.write("app.ts", "line1\nline2\nline3\n");
    const base = await repo.commit("base");

    await repo.write("app.ts", "line1\nadded-a\nline2\nline3\nadded-b\n");
    const first = await repo.commit("first");

    await repo.write("app.ts", "line1\nline2\nline3\nadded-b\n");
    await repo.write(".env.production", "TOKEN=abc\n");
    const second = await repo.commit("second");

    const targets = await collectRangeTargets(`${base}..HEAD`, {
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });

    expect(targets.chunks).toEqual([
      { path: "app.ts", text: "added-a", startLine: 2, commit: first },
      { path: "app.ts", text: "added-b", startLine: 5, commit: first },
      { path: ".env.production", text: "TOKEN=abc", startLine: 1, commit: second },
    ]);
    expect(targets.files).toEqual([
      { path: "app.ts", commit: first },
      { path: ".env.production", commit: second },
      { path: "app.ts", commit: second },
    ]);
  });

  test("joins contiguous added lines so multi-line values match", async () => {
    await repo.write("README.md", "hi\n");
    const base = await repo.commit("base");
    await repo.write("key.pem", "-----BEGIN-----\nabc\ndef\n-----END-----\n");
    await repo.commit("add key");

    const targets = await collectRangeTargets(`${base}..HEAD`, {
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });
    expect(targets.chunks).toHaveLength(1);
    expect(targets.chunks[0]!.text).toBe("-----BEGIN-----\nabc\ndef\n-----END-----");
  });

  test("treats base...head as commits on the head side only", async () => {
    await repo.write("a.txt", "a\n");
    await repo.commit("base");
    await repo.git("checkout", "-q", "-b", "feature");
    await repo.write("feature.txt", "feature-line\n");
    const featureCommit = await repo.commit("feature");
    await repo.git("checkout", "-q", "main");
    await repo.write("main.txt", "main-line\n");
    await repo.commit("main moves on");

    const targets = await collectRangeTargets("main...feature", {
      root: repo.dir,
      isGitRepo: true,
      ignore: noIgnore,
    });
    expect(targets.chunks).toEqual([
      { path: "feature.txt", text: "feature-line", startLine: 1, commit: featureCommit },
    ]);
  });

  test("fails on an unknown revision", async () => {
    await repo.write("a.txt", "a\n");
    await repo.commit("base");
    expect(
      collectRangeTargets("nope..HEAD", { root: repo.dir, isGitRepo: true, ignore: noIgnore }),
    ).rejects.toThrow("git rev-list failed");
  });
});

describe("collectPathTargets", () => {
  test("lists tracked and untracked files but respects .gitignore", async () => {
    const repo = await createTempRepo();
    try {
      await repo.write(".gitignore", ".env\nnode_modules/\n");
      await repo.write(".env", "IGNORED=1\n");
      await repo.write("node_modules/pkg/index.js", "x\n");
      await repo.write("src/index.ts", "tracked\n");
      await repo.commit("init");
      await repo.write("src/new.ts", "untracked\n");
      await repo.write(".env.local", "NOT_IGNORED=1\n");

      const targets = await collectPathTargets([], repo.dir, {
        root: repo.dir,
        isGitRepo: true,
        ignore: noIgnore,
      });

      expect(targets.files.map((f) => f.path)).toEqual([
        ".env.local",
        ".gitignore",
        "src/index.ts",
        "src/new.ts",
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  test("scans only the given subdirectory", async () => {
    const repo = await createTempRepo();
    try {
      await repo.write("a/one.ts", "1\n");
      await repo.write("b/two.ts", "2\n");
      await repo.commit("init");

      const targets = await collectPathTargets(["b"], join(repo.dir, "a"), {
        root: repo.dir,
        isGitRepo: true,
        ignore: noIgnore,
      });
      expect(targets.files).toEqual([]);

      const fromRoot = await collectPathTargets(["b"], repo.dir, {
        root: repo.dir,
        isGitRepo: true,
        ignore: noIgnore,
      });
      expect(fromRoot.files.map((f) => f.path)).toEqual(["b/two.ts"]);
    } finally {
      await repo.cleanup();
    }
  });

  test("walks the filesystem outside of git", async () => {
    const dir = await createTempDir();
    try {
      await Bun.write(join(dir, "src/app.ts"), "x\n");
      await Bun.write(join(dir, "node_modules/dep/index.js"), "x\n");
      await Bun.write(join(dir, ".env"), "x\n");

      const targets = await collectPathTargets([], dir, {
        root: dir,
        isGitRepo: false,
        ignore: noIgnore,
      });
      expect(targets.files.map((f) => f.path)).toEqual([".env", "src/app.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
