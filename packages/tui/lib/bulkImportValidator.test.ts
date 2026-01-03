import { describe, expect, test } from "bun:test";
import { BULK_IMPORT_LIMIT, parseAndValidateInput, validateBulkImportJson } from "./bulkImportValidator";

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
            expect(result.errors[0].message).toContain("array");
        });

        test("rejects empty array", () => {
            const result = validateBulkImportJson([]);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("No secrets");
        });

        test("rejects missing key field", () => {
            const result = validateBulkImportJson([{ value: "test", type: "string" }]);
            expect(result.valid).toBe(false);
            expect(result.errors[0].field).toBe("key");
        });

        test("rejects empty key", () => {
            const result = validateBulkImportJson([{ key: "", value: "test", type: "string" }]);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("empty");
        });

        test("rejects invalid key format", () => {
            const result = validateBulkImportJson([{ key: "invalid-key", value: "test", type: "string" }]);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("letters, numbers");
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
            expect(result.errors[0].field).toBe("type");
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

        test(`rejects more than ${BULK_IMPORT_LIMIT} secrets`, () => {
            const input = Array.from({ length: BULK_IMPORT_LIMIT + 1 }, (_, i) => ({
                key: `KEY_${i}`,
                value: "value",
                type: "string",
            }));
            const result = validateBulkImportJson(input);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("Maximum");
        });
    });

    describe("parseAndValidateInput", () => {
        test("parses valid JSON", () => {
            const input = '[{"key": "TEST", "value": "val", "type": "string"}]';
            const result = parseAndValidateInput(input);
            expect(result.valid).toBe(true);
        });

        test("rejects empty input", () => {
            const result = parseAndValidateInput("");
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("empty");
        });

        test("rejects invalid JSON syntax", () => {
            const result = parseAndValidateInput("{not valid json}");
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain("Invalid JSON");
        });
    });
});
