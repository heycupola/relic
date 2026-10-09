import posthog, { type BeforeSendFn } from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

const MAX_PENDING_EVENTS = 20;
const SENSITIVE_URL = /user_code/i;

let initialized = false;
const pendingEvents: [string, Record<string, unknown> | undefined][] = [];

/** Device-flow codes (directly or inside `returnUrl`) must never reach analytics. */
function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !SENSITIVE_URL.test(value)) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}

const scrubSensitiveUrls: BeforeSendFn = (event) => {
  if (!event) return event;
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue;
    for (const key of Object.keys(bag)) {
      bag[key] = scrubUrl(bag[key]);
    }
  }
  return event;
};

export type PostHogMode = "full" | "anonymous";

export function initPostHog(mode: PostHogMode): void {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;

  const anonymous = mode === "anonymous";
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: anonymous ? "never" : "identified_only",
    persistence: anonymous ? "memory" : "localStorage+cookie",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    before_send: scrubSensitiveUrls,
  });

  initialized = true;
  for (const [event, properties] of pendingEvents.splice(0)) {
    posthog.capture(event, properties);
  }
}

/** Drops events queued before analytics was allowed to start (e.g. consent rejected). */
export function discardPendingEvents(): void {
  pendingEvents.length = 0;
}

export function trackWebEvent(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  if (!initialized) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) pendingEvents.push([event, properties]);
    return;
  }
  posthog.capture(event, properties);
}

export { posthog };
