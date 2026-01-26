"use client";

import { api } from "@repo/backend";
import { Badge } from "@repo/ui/components/badge";
import { useAction } from "convex/react";
import { Check, ExternalLink } from "lucide-react";
import { useState } from "react";

interface UserInfoCardProps {
  name: string;
  email: string;
  hasPro: boolean;
  isLoading?: boolean;
}

export function UserInfoCard({ name, email, hasPro, isLoading }: UserInfoCardProps) {
  const getBillingPortal = useAction(api.user.getBillingPortalUrl);
  const getProPlan = useAction(api.user.getProPlan);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingUpgrade, setIsLoadingUpgrade] = useState(false);

  const handleBillingPortal = async () => {
    setIsLoadingPortal(true);
    try {
      const result = await getBillingPortal({});
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error("Failed to get billing portal URL:", error);
      setIsLoadingPortal(false);
    }
  };

  const handleUpgradeToPro = async () => {
    setIsLoadingUpgrade(true);
    try {
      const result = await getProPlan({});
      if (result.checkoutLink) {
        window.location.href = result.checkoutLink;
      }
    } catch (error) {
      console.error("Failed to get checkout link:", error);
      setIsLoadingUpgrade(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-2 border-border bg-card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border bg-card">
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-medium text-foreground/60">Account</h3>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-foreground">{name}</span>
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
          <p className="font-mono text-sm text-foreground/60">{email}</p>
        </div>
      </div>

      {hasPro ? (
        <>
          <div className="border-t-2 border-border" />
          <div className="p-5 space-y-3">
            <h4 className="text-sm font-medium text-foreground/60">Subscription</h4>
            <button
              type="button"
              onClick={handleBillingPortal}
              disabled={isLoadingPortal}
              className="flex items-center justify-between gap-2 w-full p-3 border border-border hover:border-foreground hover:bg-muted/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-sm text-foreground">
                {isLoadingPortal ? "Loading…" : "Manage subscription"}
              </span>
              <ExternalLink
                className="h-4 w-4 text-foreground/40 group-hover:text-foreground transition-colors"
                aria-hidden="true"
              />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="border-t-2 border-border" />
          <div className="p-5 space-y-4 bg-muted/20">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Upgrade to Pro</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">
                    <strong>Collaborate on projects</strong> - 5 free shares per project
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">
                    <strong>5 free projects</strong> included
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">Activity logs & analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">
                    <strong>Early access</strong> to new features
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Check
                    className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">Everything in Free</span>
                </li>
              </ul>

              <div className="pt-2 space-y-1.5">
                <p className="text-xs font-medium text-foreground/50">Need more?</p>
                <div className="text-xs text-foreground/60 space-y-0.5 tabular-nums">
                  <p>• Additional projects: $10 each</p>
                  <p>• Additional shares: $5 each</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleUpgradeToPro}
              disabled={isLoadingUpgrade}
              className="block w-full text-center p-3 border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
            >
              {isLoadingUpgrade ? "Loading…" : "Upgrade to Pro - $20/month"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
