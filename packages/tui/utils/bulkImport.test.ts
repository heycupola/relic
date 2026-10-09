import { describe, expect, test } from "bun:test";
import {
  computeRemovedKeys,
  envToJson,
  findCollisions,
  formatEnvValue,
  jsonToEnv,
  parseEnvContent,
  resolveType,
  validateBulkImportJson,
} from "./bulkImport";

function roundTrip(value: string): string | number | boolean | undefined {
  const env = jsonToEnv(JSON.stringify([{ key: "KEY", value }]));
  return parseEnvContent(env)[0]?.value;
}

describe("env serialization", () => {
  test.each([
    ["multi-line value", "line one\nline two\nline three"],
    ["windows line endings", "a\r\nb"],
    ["embedded double quotes", 'say "hello"'],
    ["backslashes with spaces", "C:\\Program Files\\relic"],
    ["literal backslash-n with spaces", "keep \\n literal"],
    ["single-quoted text", "'quoted'"],
    ["hash sign", "abc#def"],
    ["leading and trailing spaces", "  padded  "],
    ["PEM key", "-----BEGIN KEY-----\nMIIB\\x/+==\n-----END KEY-----"],
    ["plain value", "simple"],
    ["empty value", ""],
    ["equals sign", "a=b=c"],
  ])("round-trips %s", (_, value) => {
    expect(roundTrip(value)).toBe(value);
  });

  test("keeps every value on a single line", () => {
    const env = jsonToEnv(
      JSON.stringify([
        { key: "A", value: "x\ny" },
        { key: "B", value: "z" },
      ]),
    );
    expect(env.split("\n")).toEqual(['A="x\\ny"', "B=z"]);
  });

  test("escapes quotes and backslashes", () => {
    expect(formatEnvValue('a "b" \\c')).toBe('"a \\"b\\" \\\\c"');
  });

  test("unescapes standard dotenv sequences in double quotes", () => {
    const [secret] = parseEnvContent('KEY="a\\nb \\"c\\" \\\\d"');
    expect(secret?.value).toBe('a\nb "c" \\d');
  });

  test("treats unquoted and single-quoted values literally", () => {
    const secrets = parseEnvContent("A=foo\\nbar\nB='x\\ny'");
    expect(secrets.map((s) => s.value)).toEqual(["foo\\nbar", "x\\ny"]);
  });

  test("reads double-quoted values that span multiple lines", () => {
    const secrets = parseEnvContent('CERT="line1\nline2"\nNEXT=1');
    expect(secrets.map((s) => [s.key, s.value])).toEqual([
      ["CERT", "line1\nline2"],
      ["NEXT", "1"],
    ]);
  });

  test("ignores trailing text after a closing quote", () => {
    expect(parseEnvContent('KEY="value" # comment')[0]?.value).toBe("value");
  });
});

describe("type preservation", () => {
  test("keeps the original type of existing keys", () => {
    const known = new Map([
      ["PORT", "string" as const],
      ["FLAG", "string" as const],
      ["COUNT", "number" as const],
    ]);
    const secrets = parseEnvContent("PORT=3000\nFLAG=true\nCOUNT=5\nNEW=42", known);
    expect(secrets.map((s) => [s.key, s.type])).toEqual([
      ["PORT", "string"],
      ["FLAG", "string"],
      ["COUNT", "number"],
      ["NEW", "number"],
    ]);
  });

  test("falls back to string when the value no longer fits the known type", () => {
    expect(resolveType("not-a-number", "number")).toBe("string");
    expect(resolveType("12", "number")).toBe("number");
    expect(resolveType("false", "boolean")).toBe("boolean");
  });

  test("envToJson uses known types", () => {
    const json = JSON.parse(envToJson("ZIP=02134", undefined, new Map([["ZIP", "string"]])));
    expect(json[0]).toMatchObject({ key: "ZIP", value: "02134", type: "string" });
  });
});

describe("findCollisions", () => {
  const existing = [
    { id: "s1", key: "API_KEY" },
    { id: "s2", key: "DB_URL" },
  ];

  test("ignores secrets that were loaded into the editor", () => {
    expect(findCollisions(["API_KEY", "DB_URL"], existing, new Set(["s1", "s2"]))).toEqual([]);
  });

  test("reports existing secrets the editor did not load", () => {
    expect(findCollisions(["API_KEY", "NEW"], existing, new Set(["s2"]))).toEqual([
      { key: "API_KEY", existingSecretId: "s1" },
    ]);
  });
});

describe("bulkImportValidator", () => {
  describe("validateBulkImportJson", () => {
    test("validates correct JSON structure", () => {
      const input = [
        { key: "API_KEY", value: "secret123", type: "string" },
        { key: "DEBUG", value: "true", type: "boolean" },
      ];
      const result = validateBulkImportJson(input);
      expect(result.valid).toBe(true);
      expect(result.secrets.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    test("rejects non-array input", () => {
      const result = validateBulkImportJson({ key: "value" });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("array");
    });

    test("rejects empty array", () => {
      const result = validateBulkImportJson([]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("No secrets");
    });

    test("rejects missing key field", () => {
      const result = validateBulkImportJson([{ value: "test", type: "string" }]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.field).toBe("key");
    });

    test("rejects empty key", () => {
      const result = validateBulkImportJson([{ key: "", value: "test", type: "string" }]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("empty");
    });

    test("rejects invalid key format", () => {
      const result = validateBulkImportJson([
        { key: "invalid-key", value: "test", type: "string" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("letters, numbers");
    });

    test("allows underscore-prefixed keys", () => {
      const result = validateBulkImportJson([{ key: "_PRIVATE", value: "test", type: "string" }]);
      expect(result.valid).toBe(true);
    });

    test("rejects keys starting with numbers", () => {
      const result = validateBulkImportJson([{ key: "123KEY", value: "test", type: "string" }]);
      expect(result.valid).toBe(false);
    });

    test("detects duplicate keys within import", () => {
      const input = [
        { key: "API_KEY", value: "value1", type: "string" },
        { key: "OTHER", value: "value2", type: "string" },
        { key: "API_KEY", value: "value3", type: "string" },
      ];
      const result = validateBulkImportJson(input);
      expect(result.valid).toBe(false);
      expect(result.duplicateKeys).toContain("API_KEY");
    });

    test("rejects invalid type values", () => {
      const result = validateBulkImportJson([{ key: "KEY", value: "test", type: "invalid" }]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.field).toBe("type");
    });

    test("accepts all valid types", () => {
      const input = [
        { key: "STR", value: "test", type: "string" },
        { key: "NUM", value: "123", type: "number" },
        { key: "BOOL", value: "true", type: "boolean" },
      ];
      const result = validateBulkImportJson(input);
      expect(result.valid).toBe(true);
    });

    test("allows empty values", () => {
      const result = validateBulkImportJson([{ key: "EMPTY", value: "", type: "string" }]);
      expect(result.valid).toBe(true);
    });
  });

  describe("computeRemovedKeys", () => {
    test("returns empty when keys are identical", () => {
      const result = computeRemovedKeys(["A", "B", "C"], ["A", "B", "C"]);
      expect(result).toEqual([]);
    });

    test("detects a single removed key", () => {
      const result = computeRemovedKeys(["A", "B", "C"], ["A", "C"]);
      expect(result).toEqual(["B"]);
    });

    test("detects all keys removed", () => {
      const result = computeRemovedKeys(["A", "B"], []);
      expect(result).toEqual(["A", "B"]);
    });

    test("returns empty when new keys are added but none removed", () => {
      const result = computeRemovedKeys(["A", "B"], ["A", "B", "C"]);
      expect(result).toEqual([]);
    });

    test("detects removed keys when new keys are also added", () => {
      const result = computeRemovedKeys(["A", "B", "C"], ["A", "D"]);
      expect(result).toEqual(["B", "C"]);
    });

    test("returns empty when both lists are empty", () => {
      const result = computeRemovedKeys([], []);
      expect(result).toEqual([]);
    });
  });
});
