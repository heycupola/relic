import { type BulkImportSecret, detectType } from "@repo/bulk-import";

export {
  type BulkImportSecret,
  detectType,
  type ValidationError,
  type ValidationResult,
  validateBulkImportJson,
} from "@repo/bulk-import";

export type CollisionAction = "skip" | "overwrite" | "cancel";

export interface CollisionInfo {
  key: string;
  existingSecretId: string;
}

export type BulkImportFormat = "env" | "json";

export type SecretType = BulkImportSecret["type"];

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
