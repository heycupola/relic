"use client";

import { Button } from "@repo/ui/components/button";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Component, type ReactNode, Suspense, useEffect, useState } from "react";
import { AuthFooter } from "@/components/auth-footer";
import { RelicLogo } from "@/components/relic-logo";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

type AuthStatus = "loading" | "ready" | "approving" | "denying" | "approved" | "denied" | "error";

function ExpiredView() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-8">
            <Link href="/" className="flex items-center">
              <RelicLogo className="h-12 text-foreground" />
            </Link>
            <div className="w-full max-w-sm">
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-soft-silver/10 flex items-center justify-center mx-auto">
                  <X className="w-6 h-6 text-soft-silver" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
                    code expired
                  </h1>
                  <p className="text-sm font-light text-soft-silver" style={authSubtitleStyle}>
                    This code has expired or already been used. Please request a new code from the
                    CLI.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <AuthFooter />
        </div>
      </div>
    </div>
  );
}

class DeviceAuthErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <ExpiredView />;
    }
    return this.props.children;
  }
}

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("user_code") || "";
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const shouldQuery = userCode && status !== "approved" && status !== "denied";
  const deviceCodeInfo = useQuery(
    api.deviceAuth.getDeviceCodeInfo,
    shouldQuery ? { user_code: userCode } : "skip",
  );
  const approveDevice = useMutation(api.deviceAuth.approveDeviceCode);
  const denyDevice = useMutation(api.deviceAuth.denyDeviceCode);

  const hasSession = !!session?.user?.id;
  const sessionChecked = !sessionPending;

  useEffect(() => {
    if (!sessionChecked) return;
    if (hasSession) return;
    if (!authLoading && isAuthenticated) return;
    if (!userCode) return;

    const returnUrl = `/oauth/authorize?user_code=${userCode}`;
    router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }, [sessionChecked, hasSession, isAuthenticated, authLoading, router, userCode]);

  useEffect(() => {
    if (status === "approved" || status === "denied") return;

    if (!userCode) {
      setStatus("error");
      setErrorMessage("No user code provided");
      return;
    }

    if (!sessionChecked || authLoading) {
      setStatus("loading");
      return;
    }

    if (deviceCodeInfo === undefined) {
      setStatus("loading");
    } else if (deviceCodeInfo.status === "approved") {
      setStatus("approved");
    } else if (deviceCodeInfo.status === "denied") {
      setStatus("denied");
    } else if (isAuthenticated) {
      setStatus("ready");
    } else {
      setStatus("loading");
    }
  }, [deviceCodeInfo, userCode, status, sessionChecked, isAuthenticated, authLoading]);

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
          <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
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
            <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
              authorization failed
            </h1>
            <p className="text-sm font-light text-soft-silver" style={authSubtitleStyle}>
              {errorMessage}
            </p>
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
            <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
              access granted
            </h1>
            <p className="text-sm font-light text-soft-silver" style={authSubtitleStyle}>
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
            <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
              access denied
            </h1>
            <p className="text-sm font-light text-soft-silver" style={authSubtitleStyle}>
              You can close this window
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
            authorize cli access
          </h1>
          <p className="text-sm font-light text-soft-silver" style={authSubtitleStyle}>
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
              style={{ letterSpacing: "0.1em" }}
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
            className="w-full h-12 rounded-md bg-electric-ink text-bone-white hover:bg-electric-ink/90 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "approving" ? "Approving..." : "Approve"}
          </Button>

          <Button
            onClick={handleDeny}
            disabled={status === "approving" || status === "denying"}
            variant="secondary"
            className="w-full h-12 rounded-md font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "denying" ? "Denying..." : "Deny"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="w-full py-16">
        <div className="flex flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-8">
            <Link href="/" className="flex items-center">
              <RelicLogo className="h-12 text-foreground" />
            </Link>
            <div className="w-full max-w-sm">{renderContent()}</div>
          </div>

          <AuthFooter />
        </div>
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <DeviceAuthErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
            <div className="w-full py-16">
              <div className="flex flex-col items-center gap-10">
                <div className="flex flex-col items-center gap-8">
                  <Link href="/" className="flex items-center">
                    <RelicLogo className="h-12 text-foreground" />
                  </Link>
                  <div className="text-center space-y-3">
                    <h1 className="text-3xl font-medium text-foreground" style={authHeadingStyle}>
                      loading...
                    </h1>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <AuthorizeContent />
      </Suspense>
    </DeviceAuthErrorBoundary>
  );
}
