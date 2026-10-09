export function getSiteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  return process.env.ENVIRONMENT === "development"
    ? "http://localhost:3000"
    : "https://withrelic.com";
}
