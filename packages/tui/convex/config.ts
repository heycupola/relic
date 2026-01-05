import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL ?? "https://your-deployment.convex.cloud";
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export function createConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}

export function createAuthenticatedClient(sessionToken: string): ConvexHttpClient {
  const client = createConvexClient();
  client.setAuth(async () => sessionToken);
  return client;
}

export const config = {
  convexUrl: CONVEX_URL,
  siteUrl: SITE_URL,
  authorizePath: "/oauth/authorize",
  get verificationUri(): string {
    return `${this.siteUrl}${this.authorizePath}`;
  },
} as const;
