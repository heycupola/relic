export type SecretValueType = "string" | "number" | "boolean";
export type SecretScope = "client" | "server" | "shared";

export interface BulkImportSecret {
  key: string;
  value: string | number | boolean;
  type: SecretValueType;
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

export const MAX_KEY_LENGTH = 100;
export const MAX_VALUE_LENGTH = 10000;

const BOOLEAN_VALUES = new Set(["true", "false"]);
const VALID_TYPES = new Set(["string", "number", "boolean"]);
const VALID_SCOPES = new Set(["client", "server", "shared"]);

export function detectType(value: string): SecretValueType {
  const trimmed = value.trim().toLowerCase();
  if (BOOLEAN_VALUES.has(trimmed)) return "boolean";
  if (trimmed !== "" && !Number.isNaN(Number(trimmed)) && Number.isFinite(Number(trimmed))) {
    return "number";
  }
  return "string";
}

export function isValidKey(key: unknown): key is string {
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

function isValidType(type: unknown): type is SecretValueType {
  return typeof type === "string" && VALID_TYPES.has(type);
}

export function isValidScope(scope: unknown): scope is SecretScope {
  return typeof scope === "string" && VALID_SCOPES.has(scope);
}

export function validateBulkImportJson(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const secrets: BulkImportSecret[] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  if (!Array.isArray(data)) {
    return {
      valid: false,
      secrets: [],
      errors: [{ message: "Expected an array of secrets" }],
      duplicateKeys: [],
    };
  }

  if (data.length === 0) {
    return {
      valid: false,
      secrets: [],
      errors: [{ message: "No secrets to import" }],
      duplicateKeys: [],
    };
  }

  const arrayData = data;

  for (let i = 0; i < arrayData.length; i++) {
    const item = arrayData[i];

    if (typeof item !== "object" || item === null) {
      errors.push({ index: i, message: "Item must be an object" });
      continue;
    }

    if (!("key" in item) || typeof item.key !== "string") {
      errors.push({
        index: i,
        field: "key",
        message: "Missing or invalid key",
      });
      continue;
    }

    if (item.key.trim() === "") {
      errors.push({
        index: i,
        field: "key",
        message: "Key cannot be empty",
      });
      continue;
    }

    if (!isValidKey(item.key)) {
      errors.push({
        index: i,
        field: "key",
        message: `Invalid key: must contain only letters, numbers, and underscores (1-${MAX_KEY_LENGTH} chars)`,
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

    if ("type" in item && !isValidType(item.type)) {
      errors.push({
        index: i,
        field: "type",
        message: "Invalid type: must be string, number, or boolean",
      });
      continue;
    }

    let type: SecretValueType;
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

    let scope: SecretScope = "shared";
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
