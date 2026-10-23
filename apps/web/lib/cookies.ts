/** Readable hint mirroring the httpOnly session cookie; only used for optimistic UI. */
export const SESSION_HINT_COOKIE = "relic-session-hint";

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}
