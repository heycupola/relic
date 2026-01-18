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

export function isConvexError(
  error: unknown,
): error is { data?: { code?: string; message?: string } } {
  return typeof error === "object" && error !== null && "data" in error;
}

/**
 * Extracts a user-friendly error message from an error.
 * For ConvexError, returns the message from error.data.message.
 * For regular Error, returns error.message.
 * Falls back to a generic message if neither is available.
 */
export function extractErrorMessage(error: unknown): string {
  if (isConvexError(error)) {
    let errorData = error.data;

    while (typeof errorData === "string") {
      try {
        errorData = JSON.parse(errorData);
      } catch {
        break;
      }
    }

    if (errorData && typeof errorData === "object" && "message" in errorData) {
      const message = errorData.message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }

    if (errorData && typeof errorData === "object" && "code" in errorData) {
      const code = errorData.code;
      if (typeof code === "string") {
        return code
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase());
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Operation failed";
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

export function isSystemFunctionTimeout(error: unknown): boolean {
  if (error instanceof Error) {
    if (
      error.message.includes("_system/frontend/modules:listForAllComponents") ||
      error.message.includes("Function execution timed out") ||
      error.message.includes("maximum duration: 1s")
    ) {
      return true;
    }
  }
  if (isConvexError(error)) {
    const errorCode = error.data?.code;
    if (errorCode === "TIMEOUT" || errorCode === "FUNCTION_TIMEOUT") {
      return true;
    }
  }
  return false;
}
