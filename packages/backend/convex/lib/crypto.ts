export const API_KEY_PREFIX = "relic_sk_";

export function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${API_KEY_PREFIX}${hex}`;
}

export async function hashKey(rawKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function extractPrefix(rawKey: string): string {
  return rawKey.slice(0, API_KEY_PREFIX.length + 8);
}

export const SERVICE_TOKEN_PREFIX = "rsk_";
export function generateServiceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${SERVICE_TOKEN_PREFIX}${hex}`;
}
export function extractServiceTokenPrefix(rawToken: string): string {
  return rawToken.slice(0, SERVICE_TOKEN_PREFIX.length + 8);
}
