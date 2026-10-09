const PLACEHOLDER_ORIGIN = "https://relic.invalid";

function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * Returns a same-origin path (pathname + search + hash) for `url`, or `null` when it could
 * send the user to another origin. Browsers treat `\` like `/` and strip tabs/newlines, so
 * `/\evil.com` or `/\t/evil.com` would otherwise become protocol-relative URLs.
 */
export function getSafeReturnPath(url: string | null | undefined, origin?: string): string | null {
  if (!url) return null;
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  if (hasUnsafeChars(url)) return null;

  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : PLACEHOLDER_ORIGIN);

  let resolved: URL;
  try {
    resolved = new URL(url, base);
  } catch {
    return null;
  }
  if (resolved.origin !== new URL(base).origin) return null;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function isValidReturnUrl(url: string | null | undefined): url is string {
  return getSafeReturnPath(url) !== null;
}
