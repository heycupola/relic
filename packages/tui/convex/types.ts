export { ErrorCode, ErrorSeverity } from "@repo/backend";

import { ErrorCode } from "@repo/backend";

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
  if (isConvexError(error) && error.data?.code === ErrorCode.AUTHORIZATION_PENDING) {
    return true;
  }
  if (error instanceof Error && error.message.includes(ErrorCode.AUTHORIZATION_PENDING)) {
    return true;
  }
  return false;
}

export function isAuthorizationDenied(error: unknown): boolean {
  if (isConvexError(error) && error.data?.code === ErrorCode.DEVICE_AUTH_DENIED) {
    return true;
  }
  if (error instanceof Error && error.message.includes(ErrorCode.DEVICE_AUTH_DENIED)) {
    return true;
  }
  return false;
}

export function isDeviceCodeExpired(error: unknown): boolean {
  if (isConvexError(error) && error.data?.code === ErrorCode.DEVICE_CODE_EXPIRED) {
    return true;
  }
  if (error instanceof Error && error.message.includes(ErrorCode.DEVICE_CODE_EXPIRED)) {
    return true;
  }
  return false;
}
