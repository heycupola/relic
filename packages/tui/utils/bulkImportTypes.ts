export interface BulkImportSecret {
  key: string;
  value: string | number | boolean; // Can be actual type based on type field
  type: "string" | "number" | "boolean";
  scope?: string;
  folder?: string;
  secretId?: string; // Optional: for update mode, to track which secret is being updated
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
