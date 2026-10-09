import { describe, expect, test } from "bun:test";
import { THEME_COLORS } from "./constants";
import { formatPolicyLabel, getSecretRotationBadge, parsePolicyInput } from "./rotation";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);

describe("getSecretRotationBadge", () => {
  test("shows a dim age when no policy applies", () => {
    expect(getSecretRotationBadge({ valueChangedAt: NOW - 412 * DAY_MS }, undefined, NOW)).toEqual({
      text: "412d",
      color: THEME_COLORS.textDim,
      status: "no_policy",
    });
  });

  test("flags overdue and due-soon secrets", () => {
    expect(getSecretRotationBadge({ valueChangedAt: NOW - 100 * DAY_MS }, 90, NOW)).toMatchObject({
      text: "! 100d",
      color: THEME_COLORS.error,
      status: "overdue",
    });
    expect(getSecretRotationBadge({ valueChangedAt: NOW - 80 * DAY_MS }, 90, NOW)).toMatchObject({
      text: "~ 80d",
      color: THEME_COLORS.warning,
      status: "due_soon",
    });
  });

  test("prefers the secret policy over the environment policy", () => {
    expect(
      getSecretRotationBadge({ valueChangedAt: NOW - 100 * DAY_MS, rotateEveryDays: 365 }, 90, NOW)
        ?.status,
    ).toBe("ok");
  });

  test("renders fresh secrets as under a day", () => {
    expect(getSecretRotationBadge({ valueChangedAt: NOW - 1000 }, undefined, NOW)?.text).toBe(
      "<1d",
    );
  });

  test("returns null when the backend did not send an age", () => {
    expect(getSecretRotationBadge({}, 90, NOW)).toBeNull();
  });
});

describe("parsePolicyInput", () => {
  test("parses whole days", () => {
    expect(parsePolicyInput(" 90 ")).toEqual({ ok: true, rotateEveryDays: 90 });
  });

  test("treats 0 and off as clear", () => {
    expect(parsePolicyInput("0")).toEqual({ ok: true, rotateEveryDays: null });
    expect(parsePolicyInput("OFF")).toEqual({ ok: true, rotateEveryDays: null });
  });

  test("rejects invalid input", () => {
    for (const input of ["-1", "1.5", "abc", "3651"]) {
      expect(parsePolicyInput(input).ok).toBe(false);
    }
  });
});

describe("formatPolicyLabel", () => {
  test("formats a policy or nothing", () => {
    expect(formatPolicyLabel(90)).toBe("↻ 90d");
    expect(formatPolicyLabel(undefined)).toBeNull();
  });
});
