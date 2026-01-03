import { CHAR_LIMITS } from "./constants";
import type { BulkImportSecret, ValidationError, ValidationResult } from "./bulkImportTypes";

export const BULK_IMPORT_LIMIT = 50;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALID_TYPES = new Set(["string", "number", "boolean"]);
const VALID_SCOPES = new Set(["client", "server", "shared"]);

interface FolderSecret {
    key: string;
    value: string;
    type: string;
    scope?: string;
    folder?: string; // Added during parsing
}

function validateSecret(
    secret: Record<string, unknown>,
    index: number,
    folder: string,
    errors: ValidationError[],
    seenKeys: Map<string, { folder: string; index: number }>,
    duplicateKeys: string[]
): FolderSecret | null {
    // Validate key
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

    // Check for duplicate keys within same folder
    const keyPath = `${folder}:${key}`;
    if (seenKeys.has(keyPath)) {
        const existing = seenKeys.get(keyPath)!;
        duplicateKeys.push(key);
        errors.push({
            index,
            field: "key",
            message: `Duplicate key in folder ${folder}: ${key}`,
        });
        return null;
    }
    seenKeys.set(keyPath, { folder, index });

    // Validate value
    if (typeof secret.value !== "string") {
        errors.push({ index, field: "value", message: "Value must be a string" });
        return null;
    }

    const value = secret.value;

    if (value.length > CHAR_LIMITS.secretValue) {
        errors.push({
            index,
            field: "value",
            message: `Value too long. Maximum ${CHAR_LIMITS.secretValue} characters`,
        });
        return null;
    }

    // Validate type
    if (typeof secret.type !== "string" || !VALID_TYPES.has(secret.type)) {
        errors.push({
            index,
            field: "type",
            message: "Type must be 'string', 'number', or 'boolean'",
        });
        return null;
    }

    // Validate scope (optional, defaults to shared)
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
    };
}

export function validateBulkImportJson(input: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const secrets: BulkImportSecret[] = [];
    const seenKeys = new Map<string, { folder: string; index: number }>();
    const duplicateKeys: string[] = [];

    // Check if input is folder-based object or flat array
    if (Array.isArray(input)) {
        // Legacy flat array format - treat as root folder
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
                duplicateKeys
            );

            if (result) {
                secrets.push({
                    key: result.key,
                    value: result.value,
                    type: result.type as "string" | "number" | "boolean",
                    scope: result.scope,
                    folder: "/",
                });
            }
        }
    } else if (typeof input === "object" && input !== null) {
        // Folder-based object format
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
                    errors.push({ index: i, message: `Each item in folder "${folderName}" must be an object` });
                    continue;
                }

                const result = validateSecret(
                    item as Record<string, unknown>,
                    i,
                    folderName,
                    errors,
                    seenKeys,
                    duplicateKeys
                );

                if (result) {
                    secrets.push({
                        key: result.key,
                        value: result.value,
                        type: result.type as "string" | "number" | "boolean",
                        scope: result.scope,
                        folder: folderName,
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
