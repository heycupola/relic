import { ConvexError } from "convex/values";
import { ErrorSeverity } from "./types";

// Standardized error codes - consolidated from 74 to ~40 codes
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  INSUFFICIENT_PERMISSION = "INSUFFICIENT_PERMISSION",
  INSUFFICIENT_ROLE = "INSUFFICIENT_ROLE",

  // Resource Not Found (4xx)
  USER_NOT_FOUND = "USER_NOT_FOUND",
  PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND",
  ENVIRONMENT_NOT_FOUND = "ENVIRONMENT_NOT_FOUND",
  FOLDER_NOT_FOUND = "FOLDER_NOT_FOUND",
  SECRET_NOT_FOUND = "SECRET_NOT_FOUND",
  REQUEST_NOT_FOUND = "REQUEST_NOT_FOUND",
  SHARE_NOT_FOUND = "SHARE_NOT_FOUND",

  // Resource State Issues
  PROJECT_INACCESSIBLE = "PROJECT_INACCESSIBLE",
  RESOURCE_DELETED = "RESOURCE_DELETED",
  RESOURCE_ARCHIVED = "RESOURCE_ARCHIVED",

  // Limit & Quota Errors
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  PROJECTS_LIMIT_REACHED = "PROJECTS_LIMIT_REACHED",
  ENVIRONMENT_LIMIT_REACHED = "ENVIRONMENT_LIMIT_REACHED",
  PRO_PLAN_REQUIRED = "PRO_PLAN_REQUIRED",
  PROJECT_SHARES_LIMIT_REACHED = "PROJECT_SHARES_LIMIT_REACHED",

  // Duplicate/Conflict Errors
  RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS",
  DUPLICATE_SLUG = "DUPLICATE_SLUG",

  // Validation Errors
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  INVALID_OPERATION = "INVALID_OPERATION",
  ARRAY_LENGTH_MISMATCH = "ARRAY_LENGTH_MISMATCH",
  INVALID_RESOURCE_STATE = "INVALID_RESOURCE_STATE",

  // Device Auth Errors
  DEVICE_CODE_NOT_FOUND = "DEVICE_CODE_NOT_FOUND",
  DEVICE_CODE_EXPIRED = "DEVICE_CODE_EXPIRED",
  DEVICE_CODE_ALREADY_USED = "DEVICE_CODE_ALREADY_USED",
  AUTHORIZATION_PENDING = "AUTHORIZATION_PENDING",
  DEVICE_AUTH_DENIED = "DEVICE_AUTH_DENIED",
  POLLING_TOO_FAST = "POLLING_TOO_FAST",

  // Business Logic Errors
  CANNOT_DELETE_NON_EMPTY = "CANNOT_DELETE_NON_EMPTY",
  CANNOT_PERFORM_ACTION_ON_SELF = "CANNOT_PERFORM_ACTION_ON_SELF",
  PAYMENT_REQUIRED = "PAYMENT_REQUIRED",

  // Server Errors
  SERVER_ERROR = "SERVER_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
}

// Default error messages for each code
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Authentication & Authorization
  [ErrorCode.UNAUTHORIZED]: "Please sign in to continue",
  [ErrorCode.INSUFFICIENT_PERMISSION]: "You don't have permission to perform this action",
  [ErrorCode.INSUFFICIENT_ROLE]: "Your role doesn't allow this action",

  // Resource Not Found
  [ErrorCode.USER_NOT_FOUND]: "User not found",
  [ErrorCode.PROJECT_NOT_FOUND]: "Project not found",
  [ErrorCode.ENVIRONMENT_NOT_FOUND]: "Environment not found",
  [ErrorCode.FOLDER_NOT_FOUND]: "Folder not found",
  [ErrorCode.SECRET_NOT_FOUND]: "Secret not found",
  [ErrorCode.REQUEST_NOT_FOUND]: "Request not found",
  [ErrorCode.SHARE_NOT_FOUND]: "Project share not found",

  // Resource State
  [ErrorCode.PROJECT_INACCESSIBLE]: "This project is not accessible",
  [ErrorCode.RESOURCE_DELETED]: "This resource has been deleted",
  [ErrorCode.RESOURCE_ARCHIVED]: "This resource is archived",

  // Limits
  [ErrorCode.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded. Please slow down",
  [ErrorCode.PROJECTS_LIMIT_REACHED]: "Project limit reached",
  [ErrorCode.ENVIRONMENT_LIMIT_REACHED]: "Environment limit reached",
  [ErrorCode.PROJECT_SHARES_LIMIT_REACHED]: "Project share limit reached",
  [ErrorCode.PRO_PLAN_REQUIRED]: "To perform this act, please get pro plan.",

  // Duplicates
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: "Resource already exists",
  [ErrorCode.DUPLICATE_SLUG]: "A resource with this slug already exists",

  // Validation
  [ErrorCode.INVALID_ARGUMENTS]: "Invalid arguments provided",
  [ErrorCode.INVALID_OPERATION]: "Invalid operation",
  [ErrorCode.ARRAY_LENGTH_MISMATCH]: "Array lengths do not match",
  [ErrorCode.INVALID_RESOURCE_STATE]: "Resource is in an invalid state",

  // Device Auth
  [ErrorCode.DEVICE_CODE_NOT_FOUND]: "Device code not found",
  [ErrorCode.DEVICE_CODE_EXPIRED]: "Device code has expired",
  [ErrorCode.DEVICE_CODE_ALREADY_USED]: "Device code has already been used",
  [ErrorCode.AUTHORIZATION_PENDING]: "Authorization is pending",
  [ErrorCode.DEVICE_AUTH_DENIED]: "Device authorization was denied",
  [ErrorCode.POLLING_TOO_FAST]: "Polling too frequently. Please slow down",

  // Business Logic
  [ErrorCode.CANNOT_DELETE_NON_EMPTY]: "Cannot delete non-empty resource",
  [ErrorCode.CANNOT_PERFORM_ACTION_ON_SELF]: "Cannot perform this action on yourself",
  [ErrorCode.PAYMENT_REQUIRED]: "Payment required to access this feature",

  // Server
  [ErrorCode.SERVER_ERROR]: "An internal server error occurred",
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: "External service error",
};

export interface ErrorOptions {
  code: ErrorCode;
  message?: string;
  severity?: ErrorSeverity;
  metadata?: Record<string, unknown>;
}

// Main error factory
export function createError(options: ErrorOptions): never {
  const { code, message, severity = ErrorSeverity.Medium, metadata } = options;

  const errorMessage = message || ERROR_MESSAGES[code];

  throw new ConvexError({
    code,
    message: errorMessage,
    severity,
    ...metadata,
  });
}

// Helper functions for common error patterns

export function notFoundError(
  resource: "user" | "project" | "environment" | "folder" | "secret" | "request" | "share",
  severity: ErrorSeverity = ErrorSeverity.High,
): never {
  const codeMap = {
    user: ErrorCode.USER_NOT_FOUND,
    project: ErrorCode.PROJECT_NOT_FOUND,
    environment: ErrorCode.ENVIRONMENT_NOT_FOUND,
    folder: ErrorCode.FOLDER_NOT_FOUND,
    secret: ErrorCode.SECRET_NOT_FOUND,
    request: ErrorCode.REQUEST_NOT_FOUND,
    share: ErrorCode.SHARE_NOT_FOUND,
  };

  createError({
    code: codeMap[resource],
    severity,
  });
}

export function permissionError(
  action?: string,
  severity: ErrorSeverity = ErrorSeverity.High,
): never {
  createError({
    code: ErrorCode.INSUFFICIENT_PERMISSION,
    message: action ? `You don't have permission to ${action}` : undefined,
    severity,
  });
}

export function limitReachedError(
  resource: "projects" | "environments" | "projectShares",
  currentUsage?: number,
  limit?: number,
  severity: ErrorSeverity = ErrorSeverity.Medium,
): never {
  const codeMap = {
    projects: ErrorCode.PROJECTS_LIMIT_REACHED,
    environments: ErrorCode.ENVIRONMENT_LIMIT_REACHED,
    projectShares: ErrorCode.PROJECT_SHARES_LIMIT_REACHED,
  };

  let message: string | undefined;
  if (currentUsage !== undefined && limit !== undefined) {
    const resourceNames = {
      projects: "project",
      environments: "environment",
      projectShares: "project share",
    };
    const resourceName = resourceNames[resource];
    const plural = currentUsage !== 1 ? "s" : "";
    message = `Limit reached. You have ${currentUsage} ${resourceName}${plural} out of ${limit} allowed. Upgrade your plan for more`;
  }

  createError({
    code: codeMap[resource],
    message,
    severity,
  });
}

export function alreadyExistsError(
  resource: string,
  severity: ErrorSeverity = ErrorSeverity.Low,
): never {
  createError({
    code: ErrorCode.RESOURCE_ALREADY_EXISTS,
    message: `A ${resource} with this identifier already exists`,
    severity,
  });
}

export function deviceAuthError(
  type: "not_found" | "expired" | "already_used" | "pending" | "denied" | "polling_too_fast",
  severity: ErrorSeverity = ErrorSeverity.Medium,
): never {
  const codeMap = {
    not_found: ErrorCode.DEVICE_CODE_NOT_FOUND,
    expired: ErrorCode.DEVICE_CODE_EXPIRED,
    already_used: ErrorCode.DEVICE_CODE_ALREADY_USED,
    pending: ErrorCode.AUTHORIZATION_PENDING,
    denied: ErrorCode.DEVICE_AUTH_DENIED,
    polling_too_fast: ErrorCode.POLLING_TOO_FAST,
  };

  createError({
    code: codeMap[type],
    severity,
  });
}
