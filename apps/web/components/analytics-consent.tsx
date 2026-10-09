"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { getCookieValue } from "@/lib/cookies";
import { focusRing, primaryButton, secondaryButton } from "@/lib/styles";

const CONSENT_KEY = "relic-cookie-consent";

export type ConsentState = "accepted" | "rejected" | null;
export type ConsentRegion = "eu" | "other" | "unknown";

function getStoredConsent(): ConsentState {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (value === "accepted" || value === "rejected") return value;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
  }
  return null;
}

function storeConsent(value: Exclude<ConsentState, null>) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Consent then only lasts for this page view.
  }
}

/** `ready` stays false until the `relic-geo` cookie set by `proxy.ts` has been read. */
export function useCookieConsent(): {
  ready: boolean;
  region: ConsentRegion;
  consentState: ConsentState;
  accept: () => void;
  reject: () => void;
} {
  const [ready, setReady] = useState(false);
  const [region, setRegion] = useState<ConsentRegion>("unknown");
  const [consentState, setConsentState] = useState<ConsentState>(null);

  useEffect(() => {
    const geo = getCookieValue("relic-geo");
    setRegion(geo === "eu" ? "eu" : geo === "other" ? "other" : "unknown");
    setConsentState(getStoredConsent());
    setReady(true);
  }, []);

  const accept = useCallback(() => {
    storeConsent("accepted");
    setConsentState("accepted");
  }, []);

  const reject = useCallback(() => {
    storeConsent("rejected");
    setConsentState("rejected");
  }, []);

  return { ready, region, consentState, accept, reject };
}

interface AnalyticsConsentBannerProps {
  onAccept: () => void;
  onReject: () => void;
}

export function AnalyticsConsentBanner({ onAccept, onReject }: AnalyticsConsentBannerProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed bottom-0 left-0 right-0 z-[60] border-t-2 border-border bg-background"
    >
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6 lg:px-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 id={titleId} className="text-sm font-medium text-foreground">
              Analytics cookies
            </h2>
            <p
              id={descriptionId}
              className="text-xs text-muted-foreground leading-relaxed text-pretty sm:text-sm"
            >
              We&apos;d like to use cookies to understand how Relic is used. Your secrets are never
              part of this.{" "}
              <Link
                href="/privacy-policy"
                className={`underline underline-offset-4 text-foreground ${focusRing}`}
              >
                Privacy Policy
              </Link>
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onReject}
              className={`flex-1 px-4 py-2 text-sm sm:flex-none ${secondaryButton}`}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onAccept}
              className={`flex-1 px-4 py-2 text-sm sm:flex-none ${primaryButton}`}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
