import { logger } from "../../utils/debugLog";
import { getJwtToken, getSessionToken, updateSessionJwt } from "./session";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const JWT_EXPIRY_SECONDS = 15 * 60;

// Refresh failure tracking for circuit breaker and backoff
const REFRESH_COOLDOWN_MS = 5 * 1000; // 5 seconds cooldown after failure
const MAX_BACKOFF_MS = 30 * 1000; // Maximum 30 seconds backoff
const CIRCUIT_BREAKER_THRESHOLD = 3; // Open circuit after 3 consecutive failures
const CIRCUIT_BREAKER_RESET_MS = 60 * 1000; // Reset circuit after 60 seconds

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
  backoffMs: 1000, // Start with 1 second backoff
  circuitOpen: false,
  circuitOpenTime: null,
};

export interface JwtTokenResponse {
  token: string;
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

  // Exponential backoff: double the backoff time, capped at MAX_BACKOFF_MS
  refreshState.backoffMs = Math.min(refreshState.backoffMs * 2, MAX_BACKOFF_MS);

  // Open circuit breaker after threshold failures
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

  // Check if circuit breaker is open
  if (refreshState.circuitOpen && refreshState.circuitOpenTime) {
    // Try to reset circuit after reset period
    if (now - refreshState.circuitOpenTime >= CIRCUIT_BREAKER_RESET_MS) {
      logger.info("JWT refresh circuit breaker reset - attempting refresh");
      refreshState.circuitOpen = false;
      refreshState.circuitOpenTime = null;
      refreshState.consecutiveFailures = 0;
      refreshState.backoffMs = 1000; // Reset backoff
      return true;
    }
    return false; // Circuit is open, don't attempt
  }

  // Check cooldown period
  if (refreshState.lastFailureTime) {
    const timeSinceFailure = now - refreshState.lastFailureTime;
    if (timeSinceFailure < Math.max(REFRESH_COOLDOWN_MS, refreshState.backoffMs)) {
      return false; // Still in cooldown/backoff period
    }
  }

  return true;
}

export async function getOrRefreshJwtToken(): Promise<string | null> {
  const cachedJwt = await getJwtToken();
  if (cachedJwt) {
    // Reset state on successful cached token retrieval
    if (refreshState.consecutiveFailures > 0) {
      resetRefreshState();
    }
    return cachedJwt;
  }

  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return null;
  }

  // Check if we should attempt refresh (cooldown, backoff, circuit breaker)
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
    throw new Error("Not authenticated - no valid JWT token");
  }
  return jwt;
}
