export interface BulkImportSecret {
  key: string;
  value: string | number | boolean;
  type: "string" | "number" | "boolean";
  scope?: string;
  folder?: string;
  secretId?: string;
}

export interface ValidationError {
  index?: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  secrets: BulkImportSecret[];
  errors: ValidationError[];
  duplicateKeys: string[];
}

export type CollisionAction = "skip" | "overwrite" | "cancel";

export interface CollisionInfo {
  key: string;
  existingSecretId: string;
}

export type BulkImportFormat = "env" | "json";

const BOOLEAN_VALUES = new Set(["true", "false"]);

function detectType(value: string): "string" | "number" | "boolean" {
  const trimmed = value.trim().toLowerCase();
  if (BOOLEAN_VALUES.has(trimmed)) return "boolean";
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
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1);
    const value = stripQuotes(rawValue);

    if (key === "") continue;

    const type = detectType(value);
    secrets.push({ key, value, type });
  }

  return secrets;
}

export function isEnvFormat(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return false;

  const lines = trimmed.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l === "" || l.startsWith("#")) continue;
    if (l.match(/^[A-Za-z_][A-Za-z0-9_]*=/)) return true;
  }
  return false;
}

export function envToJson(envContent: string): string {
  const secrets = parseEnvContent(envContent).map((s) => ({
    key: s.key,
    value: s.value,
    type: s.type,
    scope: "shared",
  }));
  return JSON.stringify(secrets, null, 2);
}

export function jsonToEnv(jsonContent: string): string {
  try {
    let parsed = JSON.parse(jsonContent);
    if (!Array.isArray(parsed)) {
      if (typeof parsed === "object" && parsed !== null && "key" in parsed) {
        parsed = [parsed];
      } else {
        return "";
      }
    }

    const lines: string[] = [];
    for (const item of parsed) {
      if (typeof item === "object" && item !== null) {
        const hasKey = "key" in item && typeof item.key === "string";
        const hasValue = "value" in item;

        if (hasKey && hasValue) {
          const key = String(item.key);
          const value = item.value !== null && item.value !== undefined ? String(item.value) : "";
          if (key === "" && value === "") continue;

          const needsQuotes = /[\s#"']/.test(value);
          const quotedValue = needsQuotes ? `"${value}"` : value;
          lines.push(`${key}=${quotedValue}`);
        }
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export function detectFormat(content: string): "env" | "json" | "unknown" {
  const trimmed = content.trim();
  if (trimmed === "") return "unknown";

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "unknown";
    }
  }

  const lines = trimmed.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l === "" || l.startsWith("#")) continue;
    if (l.match(/^[A-Za-z_][A-Za-z0-9_]*=/)) return "env";
  }

  return "unknown";
}

const MAX_KEY_LENGTH = 100;
const MAX_VALUE_LENGTH = 10000;
const VALID_TYPES = new Set(["string", "number", "boolean"]);
const VALID_SCOPES = new Set(["client", "server", "shared"]);

function isValidKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
  );
}

function isValidValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.length <= MAX_VALUE_LENGTH;
  }
  return typeof value === "number" || typeof value === "boolean";
}

function isValidType(type: unknown): type is "string" | "number" | "boolean" {
  return typeof type === "string" && VALID_TYPES.has(type);
}

function isValidScope(scope: unknown): scope is "client" | "server" | "shared" {
  return typeof scope === "string" && VALID_SCOPES.has(scope);
}

export function validateBulkImportJson(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const secrets: BulkImportSecret[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  let arrayData: unknown[];
  if (!Array.isArray(data)) {
    if (typeof data === "object" && data !== null && "key" in data) {
      arrayData = [data];
    } else {
      return {
        valid: false,
        secrets: [],
        errors: [{ message: "Expected an array of secrets" }],
        duplicateKeys: [],
      };
    }
  } else {
    arrayData = data;
  }

  for (let i = 0; i < arrayData.length; i++) {
    const item = arrayData[i];

    if (typeof item !== "object" || item === null) {
      errors.push({ index: i, message: "Item must be an object" });
      continue;
    }

    if (!("key" in item) || !isValidKey(item.key)) {
      errors.push({
        index: i,
        field: "key",
        message: `Invalid key: must be 1-${MAX_KEY_LENGTH} alphanumeric/underscore chars, start with letter/underscore`,
      });
      continue;
    }

    if (!("value" in item)) {
      errors.push({ index: i, field: "value", message: "Missing value" });
      continue;
    }

    if (!isValidValue(item.value)) {
      errors.push({
        index: i,
        field: "value",
        message: `Invalid value: string must be <=${MAX_VALUE_LENGTH} chars, or use number/boolean`,
      });
      continue;
    }

    const key = item.key as string;
    if (seenKeys.has(key)) {
      if (!duplicateKeys.includes(key)) {
        duplicateKeys.push(key);
      }
      errors.push({ index: i, field: "key", message: `Duplicate key: ${key}` });
      continue;
    }
    seenKeys.add(key);

    let type: "string" | "number" | "boolean";
    if ("type" in item && isValidType(item.type)) {
      type = item.type;
    } else {
      type =
        typeof item.value === "boolean"
          ? "boolean"
          : typeof item.value === "number"
            ? "number"
            : "string";
    }

    let scope: "client" | "server" | "shared" = "shared";
    if ("scope" in item && isValidScope(item.scope)) {
      scope = item.scope;
    }

    secrets.push({
      key,
      value: item.value as string | number | boolean,
      type,
      scope,
      secretId: "secretId" in item && typeof item.secretId === "string" ? item.secretId : undefined,
    });
  }

  return {
    valid: errors.length === 0 && secrets.length > 0,
    secrets,
    errors,
    duplicateKeys,
  };
}
