import { describe, expect, test } from "bun:test";
import { isEnvFormat, parseEnvContent } from "./envParser";

describe("envParser", () => {
  describe("parseEnvContent", () => {
    test("parses basic KEY=value pairs", () => {
      const input = `
API_KEY=secret123
DATABASE_URL=postgres://localhost:5432/db
`;
      const result = parseEnvContent(input);
      expect(result).toEqual([
        { key: "API_KEY", value: "secret123", type: "string" },
        { key: "DATABASE_URL", value: "postgres://localhost:5432/db", type: "string" },
      ]);
    });

    test("detects boolean values", () => {
      const input = `
DEBUG=true
VERBOSE=false
ENABLED=TRUE
`;
      const result = parseEnvContent(input);
      expect(result[0]?.type).toBe("boolean");
      expect(result[1]?.type).toBe("boolean");
      expect(result[2]?.type).toBe("boolean");
    });

    test("detects numeric values", () => {
      const input = `
PORT=3000
TIMEOUT=1.5
NEGATIVE=-42
`;
      const result = parseEnvContent(input);
      expect(result[0]).toEqual({ key: "PORT", value: "3000", type: "number" });
      expect(result[1]).toEqual({ key: "TIMEOUT", value: "1.5", type: "number" });
      expect(result[2]).toEqual({ key: "NEGATIVE", value: "-42", type: "number" });
    });

    test("strips double quotes from values", () => {
      const input = `API_KEY="my secret value"`;
      const result = parseEnvContent(input);
      expect(result[0]?.value).toBe("my secret value");
    });

    test("strips single quotes from values", () => {
      const input = `API_KEY='my secret value'`;
      const result = parseEnvContent(input);
      expect(result[0]?.value).toBe("my secret value");
    });

    test("ignores empty lines", () => {
      const input = `
API_KEY=value1

DATABASE=value2

`;
      const result = parseEnvContent(input);
      expect(result.length).toBe(2);
    });

    test("ignores comment lines", () => {
      const input = `
# This is a comment
API_KEY=value1
# Another comment
DATABASE=value2
`;
      const result = parseEnvContent(input);
      expect(result.length).toBe(2);
    });

    test("ignores lines without =", () => {
      const input = `
VALID_KEY=value
INVALID_LINE
ANOTHER_VALID=value2
`;
      const result = parseEnvContent(input);
      expect(result.length).toBe(2);
    });

    test("handles empty values", () => {
      const input = `EMPTY_KEY=`;
      const result = parseEnvContent(input);
      expect(result[0]).toEqual({ key: "EMPTY_KEY", value: "", type: "string" });
    });

    test("handles values with = signs", () => {
      const input = `CONNECTION=host=localhost;port=5432`;
      const result = parseEnvContent(input);
      expect(result[0]?.value).toBe("host=localhost;port=5432");
    });

    test("skips entries with empty keys", () => {
      const input = `=value`;
      const result = parseEnvContent(input);
      expect(result.length).toBe(0);
    });
  });

  describe("isEnvFormat", () => {
    test("returns true for env format", () => {
      expect(isEnvFormat("API_KEY=value")).toBe(true);
      expect(isEnvFormat("DEBUG=true\nPORT=3000")).toBe(true);
    });

    test("returns false for JSON array", () => {
      expect(isEnvFormat('[{"key": "test"}]')).toBe(false);
    });

    test("returns false for JSON object", () => {
      expect(isEnvFormat('{"key": "value"}')).toBe(false);
    });

    test("returns true when env content has comments", () => {
      const input = `
# Comment
API_KEY=value
`;
      expect(isEnvFormat(input)).toBe(true);
    });
  });
});
