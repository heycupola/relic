import { describe, expect, test } from "bun:test";
import { DotenvDetector, isDotenvFileName } from "./dotenv";

describe("isDotenvFileName", () => {
  test("recognizes dotenv file names", () => {
    for (const name of [
      ".env",
      ".env.local",
      ".env.production",
      ".env.development.local",
      "production.env",
      ".dev.vars",
    ]) {
      expect(isDotenvFileName(name)).toBe(true);
    }
  });

  test("ignores look-alikes", () => {
    for (const name of [".envrc", "env.ts", "environment.ts", ".env-cmdrc", "dotenv.js", "env"]) {
      expect(isDotenvFileName(name)).toBe(false);
    }
  });
});

describe("DotenvDetector", () => {
  test("flags dotenv files anywhere in the tree", () => {
    const detector = new DotenvDetector();
    expect(detector.isViolation(".env")).toBe(true);
    expect(detector.isViolation("apps/web/.env.local")).toBe(true);
    expect(detector.isViolation("deploy/staging.env")).toBe(true);
  });

  test("allows example, sample, and template files", () => {
    const detector = new DotenvDetector();
    expect(detector.isViolation(".env.example")).toBe(false);
    expect(detector.isViolation("apps/cli/.env.sample")).toBe(false);
    expect(detector.isViolation(".env.template")).toBe(false);
    expect(detector.isViolation(".env.local.example")).toBe(false);
  });

  test("honors the relic.toml allowlist", () => {
    const detector = new DotenvDetector(["test/.env.test", "fixtures/**"]);
    expect(detector.isViolation("test/.env.test")).toBe(false);
    expect(detector.isViolation("fixtures/a/.env")).toBe(false);
    expect(detector.isViolation(".env.test")).toBe(true);
  });

  test("does not flag files inside a directory named .env", () => {
    expect(new DotenvDetector().isViolation(".env/bin/activate")).toBe(false);
  });
});
