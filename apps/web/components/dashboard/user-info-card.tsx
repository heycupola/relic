"use client";

import { api } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { useAction } from "convex/react";
import { Check, ExternalLink, Settings } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useProCheckout } from "@/hooks/useProCheckout";

interface UserInfoCardProps {
  name: string;
  email: string;
  hasPro: boolean;
  isLoading?: boolean;
}

const PRO_FEATURES: { id: string; content: ReactNode }[] = [
  {
    id: "sharing",
    content: (
      <>
        <strong>Collaborate on projects</strong>, 5 collaborators per project included
      </>
    ),
  },
  {
    id: "projects",
    content: (
      <>
        <strong>5 projects</strong> included
      </>
    ),
  },
  {
    id: "service-accounts",
    content: (
      <>
        <strong>Service accounts & OIDC</strong> for CI/CD
      </>
    ),
  },
  {
    id: "api-keys",
    content: (
      <>
        <strong>API keys</strong> for programmatic access
      </>
    ),
  },
  { id: "activity", content: "Activity logs & analytics" },
  {
    id: "early-access",
    content: (
      <>
        <strong>Early access</strong> to new features
      </>
    ),
  },
  { id: "free", content: "Everything in Free" },
];

const rowLinkClass =
  "flex items-center justify-between gap-2 w-full p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50 disabled:cursor-not-allowed";

export function UserInfoCard({ name, email, hasPro, isLoading }: UserInfoCardProps) {
  const getBillingPortal = useAction(api.user.getBillingPortalUrl);
  const checkout = useProCheckout();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const handleBillingPortal = async () => {
    setIsLoadingPortal(true);
    setPortalError(null);
    try {
      const result = await getBillingPortal({});
      if (!result.url) throw new Error("Billing portal is unavailable right now");
      window.location.assign(result.url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Could not open the billing portal");
      setIsLoadingPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5" aria-busy="true">
        <span className="sr-only">Loading account…</span>
        <div className="animate-pulse motion-reduce:animate-none space-y-3" aria-hidden="true">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="account-heading" className="border-2 border-border bg-card">
      <div className="p-4 space-y-3 sm:p-5">
        <h2 id="account-heading" className="text-sm font-medium text-foreground/60">
          Account
        </h2>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-base font-semibold text-foreground sm:text-lg truncate">
              {name}
            </span>
            <Badge
              className={
                hasPro
                  ? "bg-foreground text-background border-transparent font-bold"
                  : "bg-muted text-muted-foreground border-transparent"
              }
            >
              {hasPro ? "Pro" : "Free"}
            </Badge>
          </div>
          <p className="font-mono text-sm text-foreground/60 break-all">{email}</p>
        </div>
        <Link href="/dashboard/settings" className={rowLinkClass}>
          <span className="text-sm text-foreground">Account settings</span>
          <Settings
            className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
            aria-hidden="true"
          />
        </Link>
      </div>

      <div className="border-t-2 border-border" />

      {hasPro ? (
        <div className="p-4 space-y-3 sm:p-5">
          <h3 className="text-sm font-medium text-foreground/60">Subscription</h3>
          <button
            type="button"
            onClick={handleBillingPortal}
            disabled={isLoadingPortal}
            aria-busy={isLoadingPortal}
            className={rowLinkClass}
          >
            <span className="text-sm text-foreground">
              {isLoadingPortal ? "Opening billing portal…" : "Manage subscription"}
            </span>
            <ExternalLink
              className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
              aria-hidden="true"
            />
          </button>
          {portalError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {portalError}
            </p>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4 bg-muted/20 sm:p-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Upgrade to Pro</h3>
            <ul className="space-y-2 text-sm">
              {PRO_FEATURES.map((feature) => (
                <li key={feature.id} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-electric-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-foreground">{feature.content}</span>
                </li>
              ))}
            </ul>

            <div className="pt-2 space-y-1.5">
              <p className="text-xs font-medium text-foreground/50">Need more?</p>
              <ul className="text-xs text-foreground/60 space-y-0.5 tabular-nums list-disc list-inside">
                <li>Additional projects: $2 each</li>
                <li>Additional collaborators: $1 each</li>
              </ul>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void checkout.startCheckout()}
            disabled={checkout.isPending}
            aria-busy={checkout.isPending}
            className="block w-full text-center p-3 border-2 border-border bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
          >
            {checkout.isPending ? "Redirecting to checkout…" : "Upgrade to Pro · $9/month"}
          </button>
          {checkout.error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {checkout.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
