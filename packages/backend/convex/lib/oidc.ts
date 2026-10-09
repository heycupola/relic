import { createLogger } from "./logger";

const log = createLogger("oidc");
const decoder = new TextDecoder();

interface JWK {
  kty: string;
  kid: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
}

interface JWKSResponse {
  keys: JWK[];
}

interface JWTHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export interface OidcClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  [key: string]: unknown;
}

export interface OidcValidationResult {
  valid: boolean;
  claims?: OidcClaims;
  error?: string;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const paddedLength = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(paddedLength);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtHeader(token: string): JWTHeader {
  const [headerPart] = token.split(".");
  if (!headerPart) throw new Error("Invalid JWT: missing header");
  const decoded = decoder.decode(base64UrlDecode(headerPart));
  return JSON.parse(decoded) as JWTHeader;
}

function decodeJwtPayload(token: string): OidcClaims {
  const parts = token.split(".");
  if (!parts[1]) throw new Error("Invalid JWT: missing payload");
  const decoded = decoder.decode(base64UrlDecode(parts[1]));
  return JSON.parse(decoded) as OidcClaims;
}

async function fetchJwks(issuer: string): Promise<JWKSResponse> {
  const normalizedIssuer = issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;

  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const discoveryResponse = await fetch(discoveryUrl);

  if (!discoveryResponse.ok) {
    throw new Error(`Failed to fetch OIDC discovery document from ${discoveryUrl}`);
  }

  const discovery = (await discoveryResponse.json()) as { jwks_uri?: string };
  const jwksUri = discovery.jwks_uri;

  if (!jwksUri) {
    throw new Error("OIDC discovery document missing jwks_uri");
  }
  if (!jwksUri.startsWith("https://")) {
    throw new Error("OIDC jwks_uri must use https");
  }

  const jwksResponse = await fetch(jwksUri);
  if (!jwksResponse.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
  }

  return (await jwksResponse.json()) as JWKSResponse;
}

async function importRsaPublicKey(jwk: JWK): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg || "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function verifyJwtSignature(token: string, key: CryptoKey): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;

  const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const sigBuffer = new Uint8Array(signature).buffer as ArrayBuffer;
  return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBuffer, signedContent);
}

const CLOCK_SKEW_SECONDS = 60;

function segmentGlobToRegex(glob: string): string {
  return glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^:/]*");
}

/**
 * `*` matches within a single `:`/`/`-delimited segment. A trailing `:*` or `/*` is the one
 * exception and matches any remainder, which is how `repo:org/repo:*` admits every ref of that
 * repository and `repo:org/*` every repository of that owner.
 */
export function matchSubjectPattern(subject: string, pattern: string): boolean {
  if (pattern === subject) return true;
  if (!pattern.includes("*")) return false;

  const regex = /[:/]\*$/.test(pattern)
    ? `^${segmentGlobToRegex(pattern.slice(0, -1))}.*$`
    : `^${segmentGlobToRegex(pattern)}$`;
  return new RegExp(regex).test(subject);
}

/**
 * Returns a reason when a subject pattern is too broad to be a meaningful trust policy:
 * wildcards may only appear after a literal claim name and owner (e.g. `repo:my-org/`).
 */
export function validateSubjectPattern(pattern: string): string | null {
  const trimmed = pattern.trim();
  if (!trimmed) return "OIDC subject pattern cannot be empty";
  if (trimmed !== pattern) return "OIDC subject pattern cannot have surrounding whitespace";

  const wildcardAt = pattern.indexOf("*");
  if (wildcardAt === -1) return null;

  const literalPrefix = pattern.slice(0, wildcardAt);
  if (!/^[^:*]+:[^:*/]+[/:]/.test(literalPrefix)) {
    return "OIDC subject pattern is too broad. Wildcards must follow a literal owner, e.g. repo:my-org/my-repo:*";
  }
  return null;
}

export function validateIssuerUrl(issuer: string): string | null {
  try {
    const url = new URL(issuer);
    if (url.protocol !== "https:") return "OIDC issuer must use https";
    if (url.username || url.password || url.search || url.hash) {
      return "OIDC issuer must be a plain https URL";
    }
    return null;
  } catch {
    return "OIDC issuer must be a valid URL";
  }
}

export async function validateOidcToken(
  token: string,
  expectedIssuer: string,
  expectedSubjectPattern: string,
  expectedAudience?: string,
): Promise<OidcValidationResult> {
  const reject = (error: string, detail?: Record<string, unknown>): OidcValidationResult => {
    log.warn("OIDC token rejected", { reason: error, ...detail });
    return { valid: false, error };
  };

  try {
    const header = decodeJwtHeader(token);

    if (header.alg !== "RS256") {
      return reject("Unsupported OIDC token algorithm", { alg: header.alg });
    }

    const jwks = await fetchJwks(expectedIssuer);
    const matchingKey = header.kid
      ? jwks.keys.find((k) => k.kid === header.kid)
      : jwks.keys.find((k) => k.use === "sig" && k.kty === "RSA");

    if (!matchingKey) {
      return reject("OIDC token signing key not found");
    }

    const publicKey = await importRsaPublicKey(matchingKey);
    const signatureValid = await verifyJwtSignature(token, publicKey);

    if (!signatureValid) {
      return reject("Invalid OIDC token signature");
    }

    const claims = decodeJwtPayload(token);

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
      return reject("OIDC token is missing an expiry");
    }
    if (claims.exp < now - CLOCK_SKEW_SECONDS) {
      return reject("OIDC token has expired");
    }
    if (typeof claims.nbf === "number" && claims.nbf > now + CLOCK_SKEW_SECONDS) {
      return reject("OIDC token is not valid yet");
    }
    if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) {
      return reject("OIDC token was issued in the future");
    }

    if (
      typeof claims.iss !== "string" ||
      stripTrailingSlash(claims.iss) !== stripTrailingSlash(expectedIssuer)
    ) {
      return reject("OIDC token issuer is not trusted", { iss: claims.iss });
    }

    if (
      typeof claims.sub !== "string" ||
      !matchSubjectPattern(claims.sub, expectedSubjectPattern)
    ) {
      return reject("OIDC token subject is not allowed by this service account", {
        sub: claims.sub,
      });
    }

    if (expectedAudience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(expectedAudience)) {
        return reject("OIDC token audience is not allowed by this service account");
      }
    } else {
      log.warn("OIDC policy has no audience; accepting token for any audience", {
        issuer: expectedIssuer,
      });
    }

    return { valid: true, claims };
  } catch (error) {
    return reject("OIDC token validation failed", { error: String(error) });
  }
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
