// Re-export Convex API for use in other packages
export { api, components, internal } from "./convex/_generated/api";

// Re-export types for consumers
export type { DataModel, Doc, Id, TableNames } from "./convex/_generated/dataModel";

// Re-export enums and types from lib
export { EmailKind, ErrorSeverity, SecretValueType } from "./convex/lib/types";
