import type { BulkImportSecret } from "./bulkImportTypes";

const BOOLEAN_VALUES = new Set(["true", "false"]);

function detectType(value: string): "string" | "number" | "boolean" {
  const trimmed = value.trim().toLowerCase();

  if (BOOLEAN_VALUES.has(trimmed)) {
    return "boolean";
  }

  if (trimmed !== "" && !Number.isNaN(Number(trimmed)) && Number.isFinite(Number(trimmed))) {
    return "number";
  }

  return "string";
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvContent(content: string): BulkImportSecret[] {
  const secrets: BulkImportSecret[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1);
    const value = stripQuotes(rawValue);

    if (key === "") {
      continue;
    }

    const type = detectType(value);

    secrets.push({ key, value, type });
  }

  return secrets;
}

export function isEnvFormat(content: string): boolean {
  const trimmed = content.trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return false;
  }

  const lines = trimmed.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l === "" || l.startsWith("#")) continue;

    const match = l.match(/^[A-Za-z_][A-Za-z0-9_]*=/);
    if (match) {
      return true;
    }
  }

  return false;
}
