const DEFAULT_CONVEX_URL = "http://localhost:3210";
const DEFAULT_SITE_URL = "http://localhost:3000";

export const CONVEX_URL = process.env.CONVEX_URL ?? DEFAULT_CONVEX_URL;
export const SITE_URL = process.env.SITE_URL ?? DEFAULT_SITE_URL;
