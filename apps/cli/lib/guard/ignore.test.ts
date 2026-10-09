import { describe, expect, test } from "bun:test";
import { hasInlineIgnore, IgnoreMatcher } from "./ignore";

describe("IgnoreMatcher", () => {
  test("matches basename patterns at any depth", () => {
    const matcher = new IgnoreMatcher(["*.snap"]);
    expect(matcher.ignores("a.snap")).toBe(true);
    expect(matcher.ignores("deep/dir/b.snap")).toBe(true);
    expect(matcher.ignores("b.snap.ts")).toBe(false);
  });

  test("anchors patterns that contain a slash", () => {
    const matcher = new IgnoreMatcher(["/fixtures", "docs/*.md"]);
    expect(matcher.ignores("fixtures/a.txt")).toBe(true);
    expect(matcher.ignores("src/fixtures/a.txt")).toBe(false);
    expect(matcher.ignores("docs/intro.md")).toBe(true);
    expect(matcher.ignores("docs/nested/intro.md")).toBe(false);
  });

  test("treats trailing slash as directory-only", () => {
    const matcher = new IgnoreMatcher(["build/"]);
    expect(matcher.ignores("build/out.js")).toBe(true);
    expect(matcher.ignores("pkg/build/out.js")).toBe(true);
    expect(matcher.ignores("build")).toBe(false);
  });

  test("supports double-star segments", () => {
    const matcher = new IgnoreMatcher(["**/testdata/**", "a/**/z.txt"]);
    expect(matcher.ignores("testdata/x")).toBe(true);
    expect(matcher.ignores("pkg/testdata/deep/x")).toBe(true);
    expect(matcher.ignores("a/z.txt")).toBe(true);
    expect(matcher.ignores("a/b/c/z.txt")).toBe(true);
  });

  test("lets later negations re-include paths", () => {
    const matcher = new IgnoreMatcher(["*.env", "!keep.env"]);
    expect(matcher.ignores("drop.env")).toBe(true);
    expect(matcher.ignores("keep.env")).toBe(false);
  });

  test("skips comments and blank lines", () => {
    const matcher = IgnoreMatcher.fromFile("# fixtures\n\n  \ntest/fixtures/\n");
    expect(matcher.ignores("test/fixtures/key.pem")).toBe(true);
    expect(matcher.ignores("# fixtures")).toBe(false);
  });

  test("supports character classes and single-char wildcards", () => {
    const matcher = new IgnoreMatcher(["file[0-9].txt", "?.log"]);
    expect(matcher.ignores("file3.txt")).toBe(true);
    expect(matcher.ignores("fileA.txt")).toBe(false);
    expect(matcher.ignores("a.log")).toBe(true);
    expect(matcher.ignores("ab.log")).toBe(false);
  });
});

describe("hasInlineIgnore", () => {
  test("detects the marker in any comment style", () => {
    expect(hasInlineIgnore('const key = "abc"; // relic-guard-ignore')).toBe(true);
    expect(hasInlineIgnore("KEY=abc # relic-guard-ignore")).toBe(true);
    expect(hasInlineIgnore('const key = "abc";')).toBe(false);
  });
});
