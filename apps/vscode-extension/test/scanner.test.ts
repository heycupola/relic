import { describe, expect, test } from "bun:test";
import { findEnvReferences, maskComments, scanLanguageFor } from "../src/core/scanner";

const names = (text: string, language: "js" | "python") =>
  findEnvReferences(text, language).map((ref) => ref.name);

describe("scanLanguageFor", () => {
  test("maps editor languages", () => {
    expect(scanLanguageFor("typescriptreact")).toBe("js");
    expect(scanLanguageFor("python")).toBe("python");
    expect(scanLanguageFor("markdown")).toBeNull();
  });
});

describe("findEnvReferences (JavaScript / TypeScript)", () => {
  test("finds dot and bracket access across runtimes", () => {
    const source = [
      "const a = process.env.DATABASE_URL;",
      'const b = process.env["STRIPE_KEY"];',
      "const c = process.env['REDIS_URL'];",
      "const d = import.meta.env.VITE_API_URL;",
      "const e = Bun.env.SESSION_SECRET;",
      "const f = process.env?.OPTIONAL_KEY;",
      "const g = `${process.env.IN_TEMPLATE}`;",
    ].join("\n");
    expect(names(source, "js")).toEqual([
      "DATABASE_URL",
      "STRIPE_KEY",
      "REDIS_URL",
      "VITE_API_URL",
      "SESSION_SECRET",
      "OPTIONAL_KEY",
      "IN_TEMPLATE",
    ]);
  });

  test("reports offsets that cover only the variable name", () => {
    const source = 'x = process.env["API_KEY"] + process.env.OTHER';
    for (const ref of findEnvReferences(source, "js")) {
      expect(source.slice(ref.start, ref.end)).toBe(ref.name);
    }
  });

  test("ignores dynamic access, lookalikes, and comments", () => {
    const source = [
      "process.env[name];",
      "myprocess.env.NOPE;",
      "foo.process.env.NOPE;",
      "// process.env.COMMENTED",
      "/* Bun.env.BLOCK */",
      'const url = "http://example.com"; const k = process.env.AFTER_URL;',
    ].join("\n");
    expect(names(source, "js")).toEqual(["AFTER_URL"]);
  });

  test("keeps offsets aligned after masking", () => {
    const source = "/* a\nb */ process.env.X";
    expect(maskComments(source, "js")).toHaveLength(source.length);
    const [ref] = findEnvReferences(source, "js");
    expect(source.slice(ref!.start, ref!.end)).toBe("X");
  });
});

describe("findEnvReferences (Python)", () => {
  test("finds environ, getenv, and environ.get", () => {
    const source = [
      'a = os.environ["DATABASE_URL"]',
      "b = os.getenv('STRIPE_KEY')",
      'c = os.environ.get("REDIS_URL", "fallback")',
      'd = environ["FROM_IMPORT"]',
      'e = getenv("BARE_GETENV")',
    ].join("\n");
    expect(names(source, "python")).toEqual([
      "DATABASE_URL",
      "STRIPE_KEY",
      "REDIS_URL",
      "FROM_IMPORT",
      "BARE_GETENV",
    ]);
  });

  test("ignores comments, dynamic keys, and attribute lookalikes", () => {
    const source = [
      '# os.environ["COMMENTED"]',
      "os.environ[key]",
      'settings.environ["NOPE"]',
      'url = "#not-a-comment"; x = os.getenv("REAL")',
    ].join("\n");
    expect(names(source, "python")).toEqual(["REAL"]);
  });
});
