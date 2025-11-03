export function isValidReturnUrl(url: string | null): boolean {
  if (!url) return false;

  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.includes("..")) return false;

  return true;
}
