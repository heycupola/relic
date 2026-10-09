export function isValidReturnUrl(url: string | null): url is string {
  if (!url) return false;

  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false;
  if (url.includes("..")) return false;

  return true;
}
