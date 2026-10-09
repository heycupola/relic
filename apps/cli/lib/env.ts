/** Relic's own credentials and config (RELIC_PASSWORD, RELIC_API_KEY, RELIC_SERVICE_TOKEN, ...). */
export function isRelicEnvVar(name: string): boolean {
  const upper = name.toUpperCase();
  return upper.startsWith("RELIC_") || upper.startsWith("_RELIC_");
}

export function stripRelicEnv(env: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || isRelicEnvVar(key)) continue;
    result[key] = value;
  }
  return result;
}

/** Parent environment (minus Relic credentials) underneath the secrets; secrets win on conflict. */
export function buildChildEnv(
  parentEnv: Record<string, string | undefined>,
  secrets: Record<string, string>,
): Record<string, string> {
  return { ...stripRelicEnv(parentEnv), ...secrets };
}
