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

  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength),
    signedContent,
  );
}

export function matchSubjectPattern(subject: string, pattern: string): boolean {
  if (pattern === subject) return true;

  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -1);
    return subject.startsWith(prefix);
  }

  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(subject);
  }

  return false;
}

export async function validateOidcToken(
  token: string,
  expectedIssuer: string,
  expectedSubjectPattern: string,
  expectedAudience?: string,
): Promise<OidcValidationResult> {
  try {
    const header = decodeJwtHeader(token);

    if (header.alg !== "RS256") {
      return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
    }

    const jwks = await fetchJwks(expectedIssuer);
    const matchingKey = header.kid
      ? jwks.keys.find((k) => k.kid === header.kid)
      : jwks.keys.find((k) => k.use === "sig" && k.kty === "RSA");

    if (!matchingKey) {
      return { valid: false, error: "No matching key found in JWKS" };
    }

    const publicKey = await importRsaPublicKey(matchingKey);
    const signatureValid = await verifyJwtSignature(token, publicKey);

    if (!signatureValid) {
      return { valid: false, error: "Invalid JWT signature" };
    }

    const claims = decodeJwtPayload(token);

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      return { valid: false, error: "OIDC token has expired" };
    }

    const normalizedExpected = expectedIssuer.endsWith("/")
      ? expectedIssuer.slice(0, -1)
      : expectedIssuer;
    const normalizedActual = claims.iss.endsWith("/") ? claims.iss.slice(0, -1) : claims.iss;
    if (normalizedActual !== normalizedExpected) {
      return {
        valid: false,
        error: `Issuer mismatch: expected ${expectedIssuer}, got ${claims.iss}`,
      };
    }

    if (!matchSubjectPattern(claims.sub, expectedSubjectPattern)) {
      return {
        valid: false,
        error: `Subject mismatch: "${claims.sub}" does not match pattern "${expectedSubjectPattern}"`,
      };
    }

    if (expectedAudience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(expectedAudience)) {
        return { valid: false, error: `Audience mismatch: expected ${expectedAudience}` };
      }
    }

    return { valid: true, claims };
  } catch (error) {
    return {
      valid: false,
      error: `OIDC validation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
