const isDev = process.env.DEV === "true";

export const CONVEX_URL =
  process.env.CONVEX_URL ??
  (isDev ? "http://localhost:3210" : "https://strong-viper-562.convex.cloud");

export const CONVEX_SITE_URL =
  process.env.CONVEX_SITE_URL ??
  (isDev ? "http://localhost:3211" : "https://strong-viper-562.convex.site");

export const SITE_URL =
  process.env.SITE_URL ?? (isDev ? "http://localhost:3000" : "https://relic.so");
