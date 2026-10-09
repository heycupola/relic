import { detectType } from "./validate";

export class JsonFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonFormatError";
  }
}

/**
 * Normalizes the TUI array format (`[{ key, value, type?, scope? }]`), a single
 * `{ key, value }` item, or a flat `{ "KEY": "value" }` object into items for
 * `validateBulkImportJson`.
 */
export function toBulkImportItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;

  if (typeof data !== "object" || data === null) {
    throw new JsonFormatError('Expected an array of secrets or a { "KEY": "value" } object');
  }

  if ("key" in data && "value" in data) return [data];

  return Object.entries(data).map(([key, value]) =>
    typeof value === "string" ? { key, value, type: detectType(value) } : { key, value },
  );
}

export function parseJsonSecrets(content: string): unknown[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    // NOTE: JSON.parse messages can quote the offending input, which may be a secret value
    throw new JsonFormatError("Invalid JSON");
  }
  return toBulkImportItems(data);
}
