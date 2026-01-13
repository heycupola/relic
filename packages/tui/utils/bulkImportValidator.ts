import type { BulkImportSecret, ValidationError, ValidationResult } from "./bulkImportTypes";
import { CHAR_LIMITS } from "./constants";

export const BULK_IMPORT_LIMIT = 100;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALID_TYPES = new Set(["string", "number", "boolean"]);
const VALID_SCOPES = new Set(["client", "server", "shared"]);

interface FolderSecret {
  key: string;
  value: string | number | boolean;
  type: string;
  scope?: string;
  folder?: string;
  secretId?: string; // Optional: for update mode tracking
}

function validateSecret(
  secret: Record<string, unknown>,
  index: number,
  folder: string,
  errors: ValidationError[],
  seenKeys: Map<string, { folder: string; index: number }>,
  duplicateKeys: string[],
): FolderSecret | null {
  if (typeof secret.key !== "string") {
    errors.push({ index, field: "key", message: "Key must be a string" });
    return null;
  }

  const key = secret.key.trim();

  if (key === "") {
    errors.push({ index, field: "key", message: "Key cannot be empty" });
    return null;
  }

  if (!KEY_PATTERN.test(key)) {
    errors.push({
      index,
      field: "key",
      message: "Key must contain only letters, numbers, and underscores",
    });
    return null;
  }

  if (key.length > CHAR_LIMITS.secretKey) {
    errors.push({
      index,
      field: "key",
      message: `Key too long. Maximum ${CHAR_LIMITS.secretKey} characters`,
    });
    return null;
  }

  const keyPath = `${folder}:${key}`;
  const existing = seenKeys.get(keyPath);
  if (existing) {
    duplicateKeys.push(key);
    errors.push({
      index,
      field: "key",
      message: `Duplicate key in folder ${folder}: ${key}`,
    });
    return null;
  }
  seenKeys.set(keyPath, { folder, index });

  // Validate value based on type
  // This ensures type and value match correctly before encryption
  const expectedType = secret.type;
  let value: string | number | boolean;

  if (expectedType === "number") {
    if (typeof secret.value === "number") {
      // Check for valid number (not NaN, Infinity, etc.)
      if (Number.isNaN(secret.value) || !Number.isFinite(secret.value)) {
        errors.push({
          index,
          field: "value",
          message: `Value must be a finite number, got: ${secret.value}`,
        });
        return null;
      }
      value = secret.value;
    } else if (typeof secret.value === "string") {
      // Allow string representation for flexibility, but validate it's a valid number
      const trimmed = secret.value.trim();
      if (trimmed === "") {
        errors.push({
          index,
          field: "value",
          message: `Value cannot be empty for type "number"`,
        });
        return null;
      }
      const numValue = Number(trimmed);
      if (Number.isNaN(numValue) || !Number.isFinite(numValue)) {
        errors.push({
          index,
          field: "value",
          message: `Value must be a valid number for type "number", got: "${secret.value}"`,
        });
        return null;
      }
      // Check if string representation matches the parsed number (prevents "5abc" -> 5)
      if (String(numValue) !== trimmed && String(numValue) !== `+${trimmed}`) {
        errors.push({
          index,
          field: "value",
          message: `Value must be a valid number, got: "${secret.value}"`,
        });
        return null;
      }
      value = numValue;
    } else {
      errors.push({
        index,
        field: "value",
        message: `Value must be a number for type "number", got: ${typeof secret.value} (${secret.value})`,
      });
      return null;
    }
  } else if (expectedType === "boolean") {
    if (typeof secret.value === "boolean") {
      value = secret.value;
    } else if (typeof secret.value === "string") {
      // Only accept "true" or "false" as strings (case-insensitive)
      const trimmed = secret.value.trim().toLowerCase();
      if (trimmed === "true") {
        value = true;
      } else if (trimmed === "false") {
        value = false;
      } else {
        errors.push({
          index,
          field: "value",
          message: `Value must be "true" or "false" for type "boolean", got: "${secret.value}"`,
        });
        return null;
      }
    } else {
      errors.push({
        index,
        field: "value",
        message: `Value must be a boolean (true/false) for type "boolean", got: ${typeof secret.value} (${secret.value})`,
      });
      return null;
    }
  } else {
    // string type - accept any value and convert to string
    if (typeof secret.value !== "string") {
      value = String(secret.value);
    } else {
      value = secret.value;
    }
  }

  // Check length only for string values
  if (typeof value === "string" && value.length > CHAR_LIMITS.secretValue) {
    errors.push({
      index,
      field: "value",
      message: `Value too long. Maximum ${CHAR_LIMITS.secretValue} characters`,
    });
    return null;
  }

  if (typeof secret.type !== "string" || !VALID_TYPES.has(secret.type)) {
    errors.push({
      index,
      field: "type",
      message: "Type must be 'string', 'number', or 'boolean'",
    });
    return null;
  }

  const scope = typeof secret.scope === "string" ? secret.scope : "shared";
  if (!VALID_SCOPES.has(scope)) {
    errors.push({
      index,
      field: "scope",
      message: "Scope must be 'client', 'server', or 'shared'",
    });
    return null;
  }

  return {
    key,
    value,
    type: secret.type,
    scope,
    folder,
    secretId: typeof secret.secretId === "string" ? secret.secretId : undefined,
  };
}

export function validateBulkImportJson(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const secrets: BulkImportSecret[] = [];
  const seenKeys = new Map<string, { folder: string; index: number }>();
  const duplicateKeys: string[] = [];

  if (Array.isArray(input)) {
    if (input.length > BULK_IMPORT_LIMIT) {
      errors.push({
        message: `Too many secrets. Maximum ${BULK_IMPORT_LIMIT} per import, got ${input.length}`,
      });
      return { valid: false, secrets: [], errors, duplicateKeys: [] };
    }

    if (input.length === 0) {
      errors.push({ message: "No secrets to import" });
      return { valid: false, secrets: [], errors, duplicateKeys: [] };
    }

    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      if (typeof item !== "object" || item === null) {
        errors.push({ index: i, message: "Each item must be an object" });
        continue;
      }

      const result = validateSecret(
        item as Record<string, unknown>,
        i,
        "/",
        errors,
        seenKeys,
        duplicateKeys,
      );

      if (result) {
        secrets.push({
          key: result.key,
          value: result.value,
          type: result.type as "string" | "number" | "boolean",
          scope: result.scope,
          folder: "/",
          secretId: result.secretId,
        });
      }
    }
  } else if (typeof input === "object" && input !== null) {
    const folders = input as Record<string, unknown>;
    let totalSecrets = 0;

    for (const [folderName, folderSecrets] of Object.entries(folders)) {
      if (!Array.isArray(folderSecrets)) {
        errors.push({ message: `Folder "${folderName}" must contain an array of secrets` });
        continue;
      }

      totalSecrets += folderSecrets.length;

      for (let i = 0; i < folderSecrets.length; i++) {
        const item = folderSecrets[i];
        if (typeof item !== "object" || item === null) {
          errors.push({
            index: i,
            message: `Each item in folder "${folderName}" must be an object`,
          });
          continue;
        }

        const result = validateSecret(
          item as Record<string, unknown>,
          i,
          folderName,
          errors,
          seenKeys,
          duplicateKeys,
        );

        if (result) {
          secrets.push({
            key: result.key,
            value: result.value,
            type: result.type as "string" | "number" | "boolean",
            scope: result.scope,
            folder: folderName,
            secretId: result.secretId,
          });
        }
      }
    }

    if (totalSecrets > BULK_IMPORT_LIMIT) {
      errors.push({
        message: `Too many secrets. Maximum ${BULK_IMPORT_LIMIT} per import, got ${totalSecrets}`,
      });
      return { valid: false, secrets: [], errors, duplicateKeys: [] };
    }

    if (totalSecrets === 0) {
      errors.push({ message: "No secrets to import" });
      return { valid: false, secrets: [], errors, duplicateKeys: [] };
    }
  } else {
    errors.push({ message: "Input must be an object with folder keys or an array of secrets" });
    return { valid: false, secrets: [], errors, duplicateKeys: [] };
  }

  return {
    valid: errors.length === 0,
    secrets,
    errors,
    duplicateKeys: [...new Set(duplicateKeys)],
  };
}

export function parseAndValidateInput(content: string): ValidationResult {
  const trimmed = content.trim();

  if (trimmed === "") {
    return {
      valid: false,
      secrets: [],
      errors: [{ message: "Input is empty" }],
      duplicateKeys: [],
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return validateBulkImportJson(parsed);
  } catch {
    return {
      valid: false,
      secrets: [],
      errors: [{ message: "Invalid JSON syntax" }],
      duplicateKeys: [],
    };
  }
}
