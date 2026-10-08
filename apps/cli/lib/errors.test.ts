import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { formatRunErrorMessage, parseConvexError } from "./errors";

describe("parseConvexError", () => {
  test("extracts structured ConvexError data", () => {
    const error = new ConvexError({
      code: "PROJECT_NOT_FOUND",
      message: "Project not found",
    });

    expect(parseConvexError(error)).toEqual({
      code: "PROJECT_NOT_FOUND",
      message: "Project not found",
    });
  });

  test("extracts stringified structured ConvexError data", () => {
    const error = new ConvexError(
      JSON.stringify({
        code: "ENVIRONMENT_NOT_FOUND",
        message: "Environment not found",
      }),
    );

    expect(parseConvexError(error)).toEqual({
      code: "ENVIRONMENT_NOT_FOUND",
      message: "Environment not found",
    });
  });

  test("falls back to plain Error messages", () => {
    expect(parseConvexError(new Error("Unexpected failure"))).toEqual({
      message: "Unexpected failure",
    });
  });
});

describe("formatRunErrorMessage", () => {
  test("adds an actionable hint for missing environments", () => {
    const error = new ConvexError({
      code: "ENVIRONMENT_NOT_FOUND",
      message: "Environment not found",
    });

    expect(formatRunErrorMessage(error)).toBe(
      "Environment not found. Open the TUI with `relic` to create it, or use `relic run -e <name>` with an existing environment.",
    );
  });

  test("normalizes missing environment punctuation before adding the hint", () => {
    const error = new ConvexError({
      code: "ENVIRONMENT_NOT_FOUND",
      message: "Environment not found.",
    });

    expect(formatRunErrorMessage(error)).toBe(
      "Environment not found. Open the TUI with `relic` to create it, or use `relic run -e <name>` with an existing environment.",
    );
  });

  test("does not add a hint for unrelated structured errors", () => {
    const error = new ConvexError({
      code: "PROJECT_NOT_FOUND",
      message: "Project not found",
    });

    expect(formatRunErrorMessage(error)).toBe("Project not found");
  });
});
