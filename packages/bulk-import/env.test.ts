import { describe, expect, test } from "bun:test";
import { parseDotenv } from "./env";

function values(content: string): Record<string, string> {
  const result = parseDotenv(content);
  return Object.fromEntries(result.secrets.map((s) => [s.key, String(s.value)]));
}

describe("parseDotenv", () => {
  test("parses plain assignments and skips comments and blank lines", () => {
    expect(values("# header\n\nAPI_KEY=abc123\n  PORT = 3000\n")).toEqual({
      API_KEY: "abc123",
      PORT: "3000",
    });
  });

  test("strips export prefixes", () => {
    expect(values("export DATABASE_URL=postgres://localhost\nexport\tTOKEN=t")).toEqual({
      DATABASE_URL: "postgres://localhost",
      TOKEN: "t",
    });
  });

  test("strips inline comments from unquoted values only", () => {
    expect(values("A=value # comment\nB=abc#def\nC='quoted # kept' # comment")).toEqual({
      A: "value",
      B: "abc#def",
      C: "quoted # kept",
    });
  });

  test("handles single, double, and backtick quotes", () => {
    expect(values("A='single \\n raw'\nB=\"double\"\nC=`back 'tick' \"quote\"`")).toEqual({
      A: "single \\n raw",
      B: "double",
      C: "back 'tick' \"quote\"",
    });
  });

  test("expands escapes inside double quotes", () => {
    expect(values('A="line1\\nline2\\ttab \\"quoted\\" back\\\\slash \\x"')).toEqual({
      A: 'line1\nline2\ttab "quoted" back\\slash \\x',
    });
  });

  test("supports multiline quoted values and keeps line numbers in sync", () => {
    const content = [
      'PRIVATE_KEY="-----BEGIN KEY-----',
      "abc",
      '-----END KEY-----"',
      "SINGLE='a",
      "b'",
      "bad line",
    ].join("\n");
    const result = parseDotenv(content);
    expect(result.secrets.map((s) => s.key)).toEqual(["PRIVATE_KEY", "SINGLE"]);
    expect(result.secrets[0]?.value).toBe("-----BEGIN KEY-----\nabc\n-----END KEY-----");
    expect(result.secrets[1]?.value).toBe("a\nb");
    expect(result.invalidLines).toEqual([{ line: 6, message: "Expected KEY=value" }]);
  });

  test("handles empty values", () => {
    expect(values('EMPTY=\nQUOTED=""\nSPACES=   # just a comment')).toEqual({
      EMPTY: "",
      QUOTED: "",
      SPACES: "",
    });
  });

  test("normalizes CRLF line endings and a leading BOM", () => {
    expect(values('\uFEFFA=1\r\nB="x"\r\n')).toEqual({ A: "1", B: "x" });
  });

  test("reports unterminated quotes without the value", () => {
    const result = parseDotenv('OK=1\nBROKEN="super secret\nNEXT=2');
    expect(result.secrets.map((s) => s.key)).toEqual(["OK", "NEXT"]);
    expect(result.invalidLines).toEqual([{ line: 2, message: 'Unterminated " quote for BROKEN' }]);
    expect(JSON.stringify(result.invalidLines)).not.toContain("super secret");
  });

  test("keeps invalid key names so validation can report them", () => {
    expect(values("my-key=1\nfoo.bar=2")).toEqual({ "my-key": "1", "foo.bar": "2" });
  });

  test("detects value types like the TUI parser", () => {
    const result = parseDotenv("A=true\nB=42\nC=hello");
    expect(result.secrets.map((s) => s.type)).toEqual(["boolean", "number", "string"]);
  });
});
