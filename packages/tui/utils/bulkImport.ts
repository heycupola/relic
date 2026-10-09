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

export type SecretType = BulkImportSecret["type"];

const BOOLEAN_VALUES = new Set(["true", "false"]);

export function detectType(value: string): SecretType {
  const trimmed = value.trim().toLowerCase();
  if (BOOLEAN_VALUES.has(trimmed)) return "boolean";
  if (trimmed !== "" && !Number.isNaN(Number(trimmed)) && Number.isFinite(Number(trimmed))) {
    return "number";
  }
  return "string";
}

/** Keeps a known type while the value still fits it; unknown keys fall back to detection. */
export function resolveType(value: string, knownType?: SecretType): SecretType {
  if (!knownType) return detectType(value);
  if (knownType === "string") return "string";
  return detectType(value) === knownType ? knownType : "string";
}

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", '"': '"', "\\": "\\" };

function unescapeDoubleQuoted(value: string): string {
  return value.replace(/\\([nr"\\])/g, (_, char: string) => ESCAPES[char] ?? char);
}

function escapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function findClosingQuote(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return i;
  }
  return -1;
}

export function formatEnvValue(value: string): string {
  return /[\s#"']/.test(value) ? `"${escapeDoubleQuoted(value)}"` : value;
}

export function parseEnvContent(
  content: string,
  knownTypes?: ReadonlyMap<string, SecretType>,
): BulkImportSecret[] {
  const secrets: BulkImportSecret[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (key === "") continue;

    const rawValue = trimmed.slice(eqIndex + 1).trim();
    let value: string;

    if (rawValue.startsWith('"')) {
      let quoted = rawValue;
      let closing = findClosingQuote(quoted, 1);
      while (closing === -1 && i + 1 < lines.length) {
        i++;
        quoted += `\n${lines[i] ?? ""}`;
        closing = findClosingQuote(quoted, 1);
      }
      value = unescapeDoubleQuoted(quoted.slice(1, closing === -1 ? undefined : closing));
    } else if (rawValue.startsWith("'") && rawValue.length > 1 && rawValue.endsWith("'")) {
      value = rawValue.slice(1, -1);
    } else {
      value = rawValue;
    }

    secrets.push({ key, value, type: resolveType(value, knownTypes?.get(key)) });
  }

  return secrets;
}

export function envToJson(
  envContent: string,
  scopeMap?: ReadonlyMap<string, string>,
  knownTypes?: ReadonlyMap<string, SecretType>,
): string {
  const secrets = parseEnvContent(envContent, knownTypes).map((s) => ({
    key: s.key,
    value: s.value,
    type: s.type,
    scope: scopeMap?.get(s.key) || "shared",
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

          lines.push(`${key}=${formatEnvValue(value)}`);
        }
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
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

/** Secrets the editor would overwrite without the user having loaded them into the editor. */
export function findCollisions(
  editorKeys: string[],
  existingSecrets: ReadonlyArray<{ id: string; key: string }>,
  prefilledSecretIds: ReadonlySet<string>,
): CollisionInfo[] {
  const keys = new Set(editorKeys);
  return existingSecrets
    .filter((s) => keys.has(s.key) && !prefilledSecretIds.has(s.id))
    .map((s) => ({ key: s.key, existingSecretId: s.id }));
}

export function computeRemovedKeys(existingKeys: string[], editorKeys: string[]): string[] {
  const editorKeySet = new Set(editorKeys);
  return existingKeys.filter((key) => !editorKeySet.has(key));
}
