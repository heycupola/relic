import { describe, expect, test } from "bun:test";
import { JsonFormatError, parseJsonSecrets } from "./json";
import { validateBulkImportJson } from "./validate";

describe("parseJsonSecrets", () => {
  test("passes the TUI array format through", () => {
    const items = parseJsonSecrets('[{ "key": "A", "value": "1", "scope": "server" }]');
    expect(items).toEqual([{ key: "A", value: "1", scope: "server" }]);
  });

  test("wraps a single { key, value } item", () => {
    expect(parseJsonSecrets('{ "key": "A", "value": "x" }')).toEqual([{ key: "A", value: "x" }]);
  });

  test("converts flat objects and detects string types", () => {
    const items = parseJsonSecrets('{ "API_KEY": "abc", "PORT": "3000", "DEBUG": true }');
    expect(items).toEqual([
      { key: "API_KEY", value: "abc", type: "string" },
      { key: "PORT", value: "3000", type: "number" },
      { key: "DEBUG", value: true },
    ]);
    expect(validateBulkImportJson(items).valid).toBe(true);
  });

  test("leaves nested values for validation to reject", () => {
    const result = validateBulkImportJson(parseJsonSecrets('{ "NESTED": { "a": 1 } }'));
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.field).toBe("value");
  });

  test("hides the parser message so values never leak into errors", () => {
    expect(() => parseJsonSecrets('{ "A": "super-secret" ')).toThrow(JsonFormatError);
    expect(() => parseJsonSecrets('{ "A": "super-secret" ')).toThrow("Invalid JSON");
  });

  test("rejects scalars", () => {
    expect(() => parseJsonSecrets('"just a string"')).toThrow(JsonFormatError);
  });
});
