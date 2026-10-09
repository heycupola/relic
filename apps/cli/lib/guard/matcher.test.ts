import { describe, expect, test } from "bun:test";
import { MultiPatternMatcher } from "./matcher";

function found(patterns: string[], text: string) {
  return new MultiPatternMatcher(patterns).findAll(text).map((m) => ({
    pattern: patterns[m.patternIndex],
    at: m.start,
    text: text.slice(m.start, m.end),
  }));
}

describe("MultiPatternMatcher", () => {
  test("finds every occurrence of a single pattern", () => {
    expect(found(["secret"], "a secret and another secret")).toEqual([
      { pattern: "secret", at: 2, text: "secret" },
      { pattern: "secret", at: 21, text: "secret" },
    ]);
  });

  test("finds overlapping and nested patterns", () => {
    const result = found(["he", "she", "his", "hers"], "ushers");
    expect(result.map((r) => r.pattern).sort()).toEqual(["he", "hers", "she"]);
  });

  test("follows failure links across partial matches", () => {
    expect(found(["abcd", "bcx"], "abcx")).toEqual([{ pattern: "bcx", at: 1, text: "bcx" }]);
  });

  test("handles repeated prefixes", () => {
    expect(found(["aab"], "aaab")).toEqual([{ pattern: "aab", at: 1, text: "aab" }]);
  });

  test("matches non-ascii text", () => {
    expect(found(["şifre-ğizli"], "x = 'şifre-ğizli';")).toEqual([
      { pattern: "şifre-ğizli", at: 5, text: "şifre-ğizli" },
    ]);
  });

  test("returns nothing when there are no patterns", () => {
    const matcher = new MultiPatternMatcher([]);
    expect(matcher.isEmpty).toBe(true);
    expect(matcher.findAll("anything")).toEqual([]);
  });

  test("scales to many patterns over large input", () => {
    const patterns = Array.from({ length: 2000 }, (_, i) => `tok_${i.toString(36)}_abcdefgh`);
    const text = `${"x".repeat(1_000_000)} tok_1z_abcdefgh ${"y".repeat(1_000_000)}`;
    const started = performance.now();
    const result = found(patterns, text);
    expect(result).toEqual([
      { pattern: "tok_1z_abcdefgh", at: 1_000_001, text: "tok_1z_abcdefgh" },
    ]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
