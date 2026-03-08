import { PostHog } from "posthog-node";

import type { LoggerConfig } from "../config";

let client: PostHog | null = null;
const distinctId = `relic-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function getClient(config: LoggerConfig): PostHog | null {
  if (!config.telemetryEnabled || !config.posthogApiKey) return null;

  if (!client) {
    client = new PostHog(config.posthogApiKey, {
      host: config.telemetryProxyUrl,
      flushAt: 20,
      flushInterval: 5000,
    });
  }

  return client;
}

export function captureEvent(
  config: LoggerConfig,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const ph = getClient(config);
  if (!ph) return;

  ph.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
    },
  });
}

export async function shutdown(config: LoggerConfig): Promise<void> {
  const ph = getClient(config);
  if (ph) {
    await ph.shutdown();
    client = null;
  }
}
