"use client";

import { useEffect, useState } from "react";
import { getCookieValue } from "@/lib/cookies";

const CONSENT_KEY = "relic-cookie-consent";

type ConsentState = "accepted" | "rejected" | null;

function getStoredConsent(): ConsentState {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(CONSENT_KEY);
  if (value === "accepted" || value === "rejected") return value;
  return null;
}

export function useIsEU(): boolean {
  const [isEU, setIsEU] = useState(false);

  useEffect(() => {
    setIsEU(getCookieValue("relic-geo") === "eu");
  }, []);

  return isEU;
}

export function useCookieConsent(): {
  consentState: ConsentState;
  isEU: boolean;
  accept: () => void;
  reject: () => void;
} {
  const isEU = useIsEU();
  const [consentState, setConsentState] = useState<ConsentState>(null);

  useEffect(() => {
    setConsentState(getStoredConsent());
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setConsentState("accepted");
  };

  const reject = () => {
    localStorage.setItem(CONSENT_KEY, "rejected");
    setConsentState("rejected");
  };

  return { consentState, isEU, accept, reject };
}

interface AnalyticsConsentBannerProps {
  onAccept?: () => void;
}

export function AnalyticsConsentBanner({ onAccept }: AnalyticsConsentBannerProps) {
  const { consentState, isEU, accept, reject } = useCookieConsent();

  if (!isEU || consentState !== null) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-foreground/70 leading-relaxed sm:text-sm">
            We use cookies for analytics to improve the product.{" "}
            <a href="/privacy-policy" className="underline text-foreground/90">
              Privacy Policy
            </a>
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                reject();
              }}
              className="px-4 py-1.5 text-xs border border-border text-foreground/70 hover:text-foreground hover:border-foreground/50 transition-colors sm:text-sm"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => {
                accept();
                onAccept?.();
              }}
              className="px-4 py-1.5 text-xs border border-border bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors sm:text-sm"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
