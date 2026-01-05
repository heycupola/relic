export type {
  DeviceCodeRequest,
  DeviceCodeResponse,
  DeviceTokenRequest,
  DeviceTokenResponse,
  Environment,
  EnvironmentData,
  Folder,
  Project,
  ProjectListItem,
  ProjectShare,
  ProjectStatus,
  Secret,
  SecretScope,
  SecretValueType,
  SharedUser,
  User,
} from "./api";
export { clearProtectedApi, getProtectedApi, ProtectedApi, PublicApi, publicApi } from "./api";
export { AuthProvider, useAuth } from "./context";
export { useDeviceAuth, useSession } from "./hooks";
export type { DeviceAuthCallbacks, DeviceAuthResult, DeviceAuthStatus } from "./services";
export {
  clearSession,
  DeviceAuthService,
  deviceAuth,
  ensureValidJwt,
  fetchJwtToken,
  getJwtToken,
  getOrRefreshJwtToken,
  getSessionToken,
  hasValidSession,
  loadSession,
  saveSession,
  updateSessionJwt,
  validateSession,
} from "./services";
export type { Session, SessionValidation } from "./types";
export {
  isAuthorizationDenied,
  isAuthorizationPending,
  isConvexError,
  isDeviceCodeExpired,
  isSystemFunctionTimeout,
} from "./types";
