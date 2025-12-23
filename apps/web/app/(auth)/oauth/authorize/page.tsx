"use client";

import { Button } from "@repo/ui/components/button";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GridContainer, Section } from "@/components/grid-container";
import { api } from "@/convex/_generated/api";

type AuthStatus = "loading" | "ready" | "approving" | "denying" | "approved" | "denied" | "error";

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("user_code") || "";
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const deviceCodeInfo = useQuery(
    api.deviceAuth.getDeviceCodeInfo,
    userCode ? { user_code: userCode } : "skip",
  );
  const approveDevice = useMutation(api.deviceAuth.approveDeviceCode);
  const denyDevice = useMutation(api.deviceAuth.denyDeviceCode);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const returnUrl = `/oauth/authorize?user_code=${userCode}`;
      router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }
  }, [isAuthenticated, authLoading, router, userCode]);

  useEffect(() => {
    if (status === "approved" || status === "denied") {
      return;
    }

    if (!userCode) {
      setStatus("error");
      setErrorMessage("No user code provided");
      return;
    }

    if (deviceCodeInfo === undefined) {
      setStatus("loading");
    } else if (deviceCodeInfo === null) {
      setStatus("error");
      setErrorMessage("Invalid or expired code");
    } else if (deviceCodeInfo.status === "approved") {
      setStatus("approved");
    } else if (deviceCodeInfo.status === "denied") {
      setStatus("denied");
    } else {
      setStatus("ready");
    }
  }, [deviceCodeInfo, userCode, status]);

  const handleApprove = async () => {
    setStatus("approving");
    try {
      await approveDevice({ user_code: userCode });
      setStatus("approved");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to approve");
    }
  };

  const handleDeny = async () => {
    setStatus("denying");
    try {
      await denyDevice({ user_code: userCode });
      setStatus("denied");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to deny");
    }
  };

  const renderContent = () => {
    if (status === "loading") {
      return (
        <div className="text-center space-y-3">
          <h1
            className="text-2xl font-medium text-foreground"
            style={{
              fontFamily: "var(--font-space-grotesk, sans-serif)",
              lineHeight: "1.1",
              letterSpacing: "-0.05em",
            }}
          >
            loading...
          </h1>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <X className="w-6 h-6 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1
              className="text-2xl font-medium text-foreground"
              style={{
                fontFamily: "var(--font-space-grotesk, sans-serif)",
                lineHeight: "1.1",
                letterSpacing: "-0.05em",
              }}
            >
              authorization failed
            </h1>
            <p className="text-sm font-light text-soft-silver">{errorMessage}</p>
          </div>
        </div>
      );
    }

    if (status === "approved") {
      return (
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-electric-ink/10 flex items-center justify-center mx-auto">
            <Check className="w-6 h-6 text-electric-ink" />
          </div>
          <div className="space-y-2">
            <h1
              className="text-2xl font-medium text-foreground"
              style={{
                fontFamily: "var(--font-space-grotesk, sans-serif)",
                lineHeight: "1.1",
                letterSpacing: "-0.05em",
              }}
            >
              access granted
            </h1>
            <p className="text-sm font-light text-soft-silver">
              You can close this window and return to your terminal
            </p>
          </div>
        </div>
      );
    }

    if (status === "denied") {
      return (
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-soft-silver/10 flex items-center justify-center mx-auto">
            <X className="w-6 h-6 text-soft-silver" />
          </div>
          <div className="space-y-2">
            <h1
              className="text-2xl font-medium text-foreground"
              style={{
                fontFamily: "var(--font-space-grotesk, sans-serif)",
                lineHeight: "1.1",
                letterSpacing: "-0.05em",
              }}
            >
              access denied
            </h1>
            <p className="text-sm font-light text-soft-silver">You can close this window</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1
            className="text-2xl font-medium text-foreground"
            style={{
              fontFamily: "var(--font-space-grotesk, sans-serif)",
              lineHeight: "1.1",
              letterSpacing: "-0.05em",
            }}
          >
            authorize cli access
          </h1>
          <p className="text-sm font-light text-soft-silver">
            The Relic CLI is requesting access to your account
          </p>
        </div>

        <div className="bg-graphite-grey/30 border border-border rounded-md p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              User Code
            </p>
            <p
              className="text-2xl font-mono font-medium text-electric-ink tracking-wider"
              style={{
                letterSpacing: "0.1em",
              }}
            >
              {userCode}
            </p>
          </div>

          {deviceCodeInfo?.clientId && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client
              </p>
              <p className="text-sm font-light text-foreground">{deviceCodeInfo.clientId}</p>
            </div>
          )}

          {deviceCodeInfo?.scope && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Permissions
              </p>
              <p className="text-sm font-light text-foreground">{deviceCodeInfo.scope}</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleApprove}
            disabled={status === "approving" || status === "denying"}
            className="w-full h-12 bg-electric-ink text-bone-white hover:bg-electric-ink/90"
          >
            {status === "approving" ? "Approving..." : "Approve"}
          </Button>

          <Button
            onClick={handleDeny}
            disabled={status === "approving" || status === "denying"}
            variant="secondary"
            className="w-full h-12"
          >
            {status === "denying" ? "Denying..." : "Deny"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <GridContainer>
      <Section className="border-t-0 flex-1 flex items-center justify-center">
        <div className="w-full py-16">
          <div className="flex flex-col items-center gap-10">
            <Link href="/" className="flex items-center">
              <Image
                src="/basic-logo.svg"
                alt="Relic"
                width={44}
                height={44}
                className="w-12 h-auto"
              />
            </Link>

            <div className="w-full max-w-sm">{renderContent()}</div>

            <div className="flex items-center gap-4 text-xs font-light text-muted-foreground">
              <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
                privacy
              </Link>
              <span className="text-border">•</span>
              <Link href="/terms-of-service" className="hover:text-foreground transition-colors">
                terms
              </Link>
            </div>
          </div>
        </div>
      </Section>
    </GridContainer>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <GridContainer>
          <Section className="border-t-0 flex-1 flex items-center justify-center">
            <div className="w-full py-16">
              <div className="flex flex-col items-center gap-10">
                <Link href="/" className="flex items-center">
                  <Image
                    src="/basic-logo.svg"
                    alt="Relic"
                    width={44}
                    height={44}
                    className="w-12 h-auto"
                  />
                </Link>
                <div className="text-center">
                  <h1
                    className="text-2xl font-medium text-foreground"
                    style={{
                      fontFamily: "var(--font-space-grotesk, sans-serif)",
                      lineHeight: "1.1",
                      letterSpacing: "-0.05em",
                    }}
                  >
                    loading...
                  </h1>
                </div>
              </div>
            </div>
          </Section>
        </GridContainer>
      }
    >
      <AuthorizeContent />
    </Suspense>
  );
}
