export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  session_token: string;
  token_type: string;
  expires_in: number;
}

export type DeviceAuthStatus = "pending" | "approved" | "denied" | "expired" | "error";

export interface Session {
  sessionToken: string;
  tokenType: string;
  expiresAt: number;
  jwtToken?: string;
  jwtExpiresAt?: number;
}

export interface SessionValidation {
  isValid: boolean;
  isExpired: boolean;
  session: Session | null;
}

export function isConvexError(error: unknown): error is { data?: { code?: string } } {
  return typeof error === "object" && error !== null && "data" in error;
}

export function isAuthorizationPending(error: unknown): boolean {
  if (isConvexError(error) && error.data?.code === "AUTHORIZATION_PENDING") {
    return true;
  }
  if (error instanceof Error && error.message.includes("AUTHORIZATION_PENDING")) {
    return true;
  }
  return false;
}

export function isAuthorizationDenied(error: unknown): boolean {
  if (isConvexError(error) && error.data?.code === "DEVICE_AUTH_DENIED") {
    return true;
  }
  if (error instanceof Error && error.message.includes("DEVICE_AUTH_DENIED")) {
    return true;
  }
  return false;
}

export function isDeviceCodeExpired(error: unknown): boolean {
  if (isConvexError(error) && error.data?.code === "DEVICE_CODE_EXPIRED") {
    return true;
  }
  if (error instanceof Error && error.message.includes("DEVICE_CODE_EXPIRED")) {
    return true;
  }
  return false;
}

/**
 * Checks if an error is a Convex system function timeout.
 * This can occur when Convex tries to discover components (e.g., Autumn components)
 * but the system function times out. This is typically non-critical and can be safely ignored
 * if the TUI app doesn't use those components.
 */
export function isSystemFunctionTimeout(error: unknown): boolean {
  if (error instanceof Error) {
    // Check for the specific system function timeout error
    if (
      error.message.includes("_system/frontend/modules:listForAllComponents") ||
      error.message.includes("Function execution timed out") ||
      error.message.includes("maximum duration: 1s")
    ) {
      return true;
    }
  }
  if (isConvexError(error)) {
    // Check for timeout-related error codes
    const errorCode = error.data?.code;
    if (errorCode === "TIMEOUT" || errorCode === "FUNCTION_TIMEOUT") {
      return true;
    }
  }
  return false;
}
