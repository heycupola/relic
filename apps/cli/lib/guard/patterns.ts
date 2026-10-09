export const DEFAULT_MIN_LENGTH = 8;

export interface SecretSource {
  key: string;
  environment: string;
}

export interface SecretPatterns {
  values: string[];
  sources: SecretSource[][];
  skipped: number;
}

const COMMON_LITERALS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "none",
  "yes",
  "no",
  "on",
  "off",
  "enabled",
  "disabled",
  "development",
  "production",
  "staging",
  "localhost",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isLocalHost(host: string): boolean {
  const lower = host.toLowerCase();
  return LOCAL_HOSTS.has(lower) || lower.endsWith(".localhost");
}

function isLocalUrl(value: string): boolean {
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//i.exec(value);
  if (schemeMatch) {
    try {
      return isLocalHost(new URL(value).hostname);
    } catch {
      return false;
    }
  }
  const hostPort = /^(\[::1\]|[a-z0-9.-]+)(:\d+)?(\/.*)?$/i.exec(value);
  return hostPort !== null && isLocalHost(hostPort[1]!);
}

export function isTrivialValue(value: string, minLength: number = DEFAULT_MIN_LENGTH): boolean {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return true;
  if (COMMON_LITERALS.has(trimmed.toLowerCase())) return true;
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return true;
  if (/^(.)\1*$/s.test(trimmed)) return true;
  if (isLocalUrl(trimmed)) return true;
  return false;
}

/**
 * Collapses decrypted secrets into unique, non-trivial search patterns. A value
 * shared by several keys or environments becomes one pattern with many sources.
 */
export function buildSecretPatterns(
  secrets: Iterable<{ key: string; value: string; environment: string }>,
  minLength: number = DEFAULT_MIN_LENGTH,
): SecretPatterns {
  const index = new Map<string, number>();
  const values: string[] = [];
  const sources: SecretSource[][] = [];
  let skipped = 0;

  for (const secret of secrets) {
    if (isTrivialValue(secret.value, minLength)) {
      skipped++;
      continue;
    }

    const pattern = secret.value.trim();
    let position = index.get(pattern);
    if (position === undefined) {
      position = values.length;
      index.set(pattern, position);
      values.push(pattern);
      sources.push([]);
    }

    const existing = sources[position]!;
    if (!existing.some((s) => s.key === secret.key && s.environment === secret.environment)) {
      existing.push({ key: secret.key, environment: secret.environment });
    }
  }

  return { values, sources, skipped };
}
