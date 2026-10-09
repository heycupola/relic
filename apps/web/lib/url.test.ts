import { describe, expect, test } from "bun:test";
import { getSafeReturnPath, isValidReturnUrl } from "./url";

const ORIGIN = "https://withrelic.com";

describe("getSafeReturnPath", () => {
  test("keeps same-origin paths with search and hash", () => {
    expect(getSafeReturnPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(getSafeReturnPath("/dashboard?action=upgrade", ORIGIN)).toBe(
      "/dashboard?action=upgrade",
    );
    expect(getSafeReturnPath("/oauth/authorize?user_code=AB-CD#top", ORIGIN)).toBe(
      "/oauth/authorize?user_code=AB-CD#top",
    );
  });

  test("normalizes dot segments instead of leaving the origin", () => {
    expect(getSafeReturnPath("/a/../dashboard", ORIGIN)).toBe("/dashboard");
  });

  test("rejects empty and relative values", () => {
    expect(getSafeReturnPath(null, ORIGIN)).toBeNull();
    expect(getSafeReturnPath("", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("dashboard", ORIGIN)).toBeNull();
  });

  test("rejects absolute and protocol-relative URLs", () => {
    expect(getSafeReturnPath("https://evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("//evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("javascript:alert(1)", ORIGIN)).toBeNull();
  });

  test("rejects backslash tricks", () => {
    expect(getSafeReturnPath("/\\evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("/\\/evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("/path\\..\\evil", ORIGIN)).toBeNull();
  });

  test("rejects control characters browsers strip", () => {
    expect(getSafeReturnPath("/\t/evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("/\n/evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("/\r/evil.com", ORIGIN)).toBeNull();
    expect(getSafeReturnPath("/\u0000/evil.com", ORIGIN)).toBeNull();
  });
});

describe("isValidReturnUrl", () => {
  test("mirrors getSafeReturnPath", () => {
    expect(isValidReturnUrl("/dashboard")).toBe(true);
    expect(isValidReturnUrl("//evil.com")).toBe(false);
    expect(isValidReturnUrl("/\\evil.com")).toBe(false);
  });
});
