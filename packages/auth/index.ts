export { PublicApi, publicApi } from "./src/api";
export { DeviceAuthService, deviceAuth } from "./src/deviceAuth";
export {
  ensureValidJwt,
  fetchJwtToken,
  getOrRefreshJwtToken,
  type Logger,
  setJwtLogger,
} from "./src/jwt";
export {
  checkPasswordRequirements,
  clearPassword,
  getPasswordFilePath,
  getPasswordFromStorage,
  getRelicDir,
  getStrengthColor,
  getStrengthIndicator,
  hasPassword,
  isPasswordFromEnv,
  type PasswordRequirement,
  type PasswordValidationResult,
  passwordsMatch,
  savePassword,
  validatePassword,
  verifyPassword,
  verifyPasswordWithExistingKeys,
} from "./src/password";
export {
  clearSession,
  getConfigDir,
  getJwtToken,
  getSessionFilePath,
  getSessionToken,
  hasValidSession,
  isSessionFromEnv,
  loadSession,
  type SessionChangeEvent,
  saveSession,
  updateSessionJwt,
  validateSession,
  watchSession,
} from "./src/session";
export type {
  DeviceAuthCallbacks,
  DeviceAuthOptions,
  DeviceAuthResult,
  DeviceAuthStatus,
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceTokenRequest,
  DeviceTokenResponse,
  JwtTokenResponse,
  Session,
  SessionValidation,
} from "./src/types";
export {
  extractErrorMessage,
  isAuthorizationDenied,
  isAuthorizationPending,
  isConvexError,
  isDeviceCodeExpired,
  isSystemFunctionTimeout,
} from "./src/types";
