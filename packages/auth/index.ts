export { PublicApi, publicApi } from "./src/api";
export { CONVEX_SITE_URL, CONVEX_URL, SITE_URL } from "./src/constants";
export { DeviceAuthService, deviceAuth } from "./src/deviceAuth";
export {
  AuthenticationError,
  InvalidJwtError,
  SessionExpiredError,
} from "./src/errors";
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
  getConfigDir,
  getPasswordFilePath,
  getPasswordFromStorage,
  getStrengthColor,
  hasPassword,
  hasPasswordForAccount,
  isPasswordFromEnv,
  type PasswordAccount,
  type PasswordRequirement,
  type PasswordValidationResult,
  savePassword,
  validatePassword,
  verifyPassword,
  verifyPasswordWithExistingKeys,
} from "./src/password";
export {
  clearSession,
  getJwtToken,
  getSessionFilePath,
  getSessionToken,
  hasValidSession,
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
export {
  type CachedUserKeys,
  cacheUserKeys,
  clearCachedUserKeys,
  getCachedUserKeys,
  getUserKeyCacheDb,
  initializeSchema as initializeUserKeyCacheSchema,
} from "./src/userKeyCache";
