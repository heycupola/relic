export interface BulkImportSecret {
    key: string;
    value: string;
    type: "string" | "number" | "boolean";
    scope?: string;
    folder?: string;
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
