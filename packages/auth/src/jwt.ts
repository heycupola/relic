import { SITE_URL } from "./constants";
import { InvalidJwtError } from "./errors";
import { getJwtToken, getSessionToken, updateSessionJwt } from "./session";
import type { JwtTokenResponse } from "./types";

const JWT_EXPIRY_SECONDS = 15 * 60;
const REFRESH_COOLDOWN_MS = 5 * 1000;
const MAX_BACKOFF_MS = 30 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 60 * 1000;

interface RefreshState {
  lastFailureTime: number | null;
  consecutiveFailures: number;
  backoffMs: number;
  circuitOpen: boolean;
  circuitOpenTime: number | null;
}

let refreshState: RefreshState = {
  lastFailureTime: null,
  consecutiveFailures: 0,
  backoffMs: 1000,
  circuitOpen: false,
  circuitOpenTime: null,
};

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

let logger: Logger = noopLogger;

export function setJwtLogger(customLogger: Logger): void {
  logger = customLogger;
}

export async function fetchJwtToken(sessionToken: string): Promise<string> {
  const tokenUrl = `${SITE_URL}/api/auth/convex/token`;

  const response = await fetch(tokenUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch JWT token: ${response.status} ${text}`);
  }

  const data = (await response.json()) as JwtTokenResponse;
  return data.token;
}

function resetRefreshState(): void {
  refreshState = {
    lastFailureTime: null,
    consecutiveFailures: 0,
    backoffMs: 1000,
    circuitOpen: false,
    circuitOpenTime: null,
  };
}

function recordRefreshSuccess(): void {
  resetRefreshState();
}

function recordRefreshFailure(): void {
  const now = Date.now();
  refreshState.lastFailureTime = now;
  refreshState.consecutiveFailures += 1;
  refreshState.backoffMs = Math.min(refreshState.backoffMs * 2, MAX_BACKOFF_MS);

  if (refreshState.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    refreshState.circuitOpen = true;
    refreshState.circuitOpenTime = now;
    logger.warn(
      `JWT refresh circuit breaker opened after ${refreshState.consecutiveFailures} consecutive failures`,
    );
  }
}

function shouldAttemptRefresh(): boolean {
  const now = Date.now();

  if (refreshState.circuitOpen && refreshState.circuitOpenTime) {
    if (now - refreshState.circuitOpenTime >= CIRCUIT_BREAKER_RESET_MS) {
      logger.info("JWT refresh circuit breaker reset - attempting refresh");
      refreshState.circuitOpen = false;
      refreshState.circuitOpenTime = null;
      refreshState.consecutiveFailures = 0;
      refreshState.backoffMs = 1000;
      return true;
    }
    return false;
  }

  if (refreshState.lastFailureTime) {
    const timeSinceFailure = now - refreshState.lastFailureTime;
    if (timeSinceFailure < Math.max(REFRESH_COOLDOWN_MS, refreshState.backoffMs)) {
      return false;
    }
  }

  return true;
}

export async function getOrRefreshJwtToken(): Promise<string | null> {
  const cachedJwt = await getJwtToken();
  if (cachedJwt) {
    if (refreshState.consecutiveFailures > 0) {
      resetRefreshState();
    }
    return cachedJwt;
  }

  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return null;
  }

  if (!shouldAttemptRefresh()) {
    logger.debug("JWT refresh skipped due to cooldown/backoff/circuit breaker");
    return null;
  }

  try {
    const jwtToken = await fetchJwtToken(sessionToken);
    const jwtExpiresAt = Date.now() + JWT_EXPIRY_SECONDS * 1000;
    await updateSessionJwt(jwtToken, jwtExpiresAt);
    recordRefreshSuccess();
    return jwtToken;
  } catch (error) {
    logger.error("Failed to refresh JWT token:", error);
    recordRefreshFailure();
    return null;
  }
}

export async function ensureValidJwt(): Promise<string> {
  const jwt = await getOrRefreshJwtToken();
  if (!jwt) {
    throw new InvalidJwtError("Not authenticated - no valid JWT token");
  }
  return jwt;
}
