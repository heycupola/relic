import { logger } from "../../utils/debugLog";
import { getJwtToken, getSessionToken, updateSessionJwt } from "./session";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const JWT_EXPIRY_SECONDS = 15 * 60;

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

export async function getOrRefreshJwtToken(): Promise<string | null> {
  const cachedJwt = await getJwtToken();
  if (cachedJwt) {
    return cachedJwt;
  }

  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return null;
  }

  try {
    const jwtToken = await fetchJwtToken(sessionToken);
    const jwtExpiresAt = Date.now() + JWT_EXPIRY_SECONDS * 1000;
    await updateSessionJwt(jwtToken, jwtExpiresAt);
    return jwtToken;
  } catch (error) {
    logger.error("Failed to refresh JWT token:", error);
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
