import { createLogger } from "@repo/logger";
import { REQUEST_TIMEOUT_MS } from "./api";

const log = createLogger("cli");

export async function resolveOidcToken(): Promise<string | undefined> {
  if (process.env.RELIC_OIDC_TOKEN) {
    return process.env.RELIC_OIDC_TOKEN;
  }

  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (requestUrl && requestToken) {
    try {
      const response = await fetch(`${requestUrl}&audience=relic`, {
        headers: { Authorization: `bearer ${requestToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as { value?: string };
        return data.value;
      }
    } catch {
      log.warn("Failed to request GitHub Actions OIDC token");
    }
  }

  // Legacy GitLab (< 17.0) predefined token; newer GitLab requires `id_tokens: RELIC_OIDC_TOKEN`.
  if (process.env.CI_JOB_JWT_V2) {
    return process.env.CI_JOB_JWT_V2;
  }

  return undefined;
}
