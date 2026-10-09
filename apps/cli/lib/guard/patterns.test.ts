import { describe, expect, test } from "bun:test";
import { buildSecretPatterns, isTrivialValue } from "./patterns";

describe("isTrivialValue", () => {
  test("skips values shorter than the minimum length", () => {
    expect(isTrivialValue("abc1234")).toBe(true);
    expect(isTrivialValue("abc12345")).toBe(false);
    expect(isTrivialValue("abc1234", 4)).toBe(false);
  });

  test("skips booleans, numbers, and common literals", () => {
    for (const value of [
      "true",
      "FALSE",
      "undefined",
      "12345678",
      "3.14159265",
      "1e10000",
      "production",
    ]) {
      expect(isTrivialValue(value, 1)).toBe(true);
    }
  });

  test("skips localhost URLs and host:port values", () => {
    for (const value of [
      "http://localhost:3000",
      "postgres://user:pass@127.0.0.1:5432/app",
      "redis://0.0.0.0:6379",
      "http://[::1]:8080/path",
      "https://app.localhost",
      "localhost:5432",
    ]) {
      expect(isTrivialValue(value)).toBe(true);
    }
  });

  test("skips repeated single characters", () => {
    expect(isTrivialValue("xxxxxxxxxx")).toBe(true);
  });

  test("keeps real-looking secrets", () => {
    for (const value of [
      "sk_live_51HxQ2kLmN",
      "https://api.stripe.com/v1?key=abcdef",
      "postgres://admin:pw@db.internal:5432/app",
    ]) {
      expect(isTrivialValue(value)).toBe(false);
    }
  });
});

describe("buildSecretPatterns", () => {
  test("dedupes values and keeps every source", () => {
    const patterns = buildSecretPatterns([
      { key: "STRIPE_KEY", value: "sk_live_abcdef123", environment: "production" },
      { key: "STRIPE_KEY", value: "sk_live_abcdef123", environment: "staging" },
      { key: "LEGACY_STRIPE", value: "sk_live_abcdef123", environment: "production" },
      { key: "DEBUG", value: "true", environment: "production" },
      { key: "PORT", value: "3000", environment: "production" },
    ]);

    expect(patterns.values).toEqual(["sk_live_abcdef123"]);
    expect(patterns.sources[0]).toEqual([
      { key: "STRIPE_KEY", environment: "production" },
      { key: "STRIPE_KEY", environment: "staging" },
      { key: "LEGACY_STRIPE", environment: "production" },
    ]);
    expect(patterns.skipped).toBe(2);
  });

  test("trims surrounding whitespace from values", () => {
    const patterns = buildSecretPatterns([
      { key: "TOKEN", value: "  ghp_abcdefgh1234\n", environment: "dev" },
    ]);
    expect(patterns.values).toEqual(["ghp_abcdefgh1234"]);
  });
});
