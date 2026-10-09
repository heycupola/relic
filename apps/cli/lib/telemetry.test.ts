import { describe, expect, test } from "bun:test";
import { sanitizeStack } from "./telemetry";

describe("sanitizeStack", () => {
  test("reduces absolute paths to file basenames", () => {
    const stack = [
      "Error: boom",
      "    at run (/Users/alice/projects/relic/apps/cli/commands/run.ts:12:5)",
      "    at file:///home/bob/.bun/install/global/node_modules/relic/dist/cli.js:1:2",
      "    at C:\\Users\\carol\\relic\\cli.js:3:4",
    ].join("\n");

    const sanitized = sanitizeStack(stack)!;
    expect(sanitized).toContain("run (run.ts:12:5)");
    expect(sanitized).toContain("at cli.js:1:2");
    expect(sanitized).not.toContain("alice");
    expect(sanitized).not.toContain("bob");
    expect(sanitized).not.toContain("carol");
  });

  test("returns undefined without a stack", () => {
    expect(sanitizeStack(undefined)).toBeUndefined();
  });
});
