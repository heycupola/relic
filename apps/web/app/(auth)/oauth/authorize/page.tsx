"use client";

import { api } from "@repo/backend";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Component, type ReactNode, Suspense, useEffect, useState } from "react";
import { StatusBox } from "@/components/status-box";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

type AuthStatus = "loading" | "ready" | "approving" | "denying" | "approved" | "denied" | "error";

// Error boundary to catch Convex errors and display them gracefully
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ConvexErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
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

  const shouldQuery =
    userCode && status !== "approved" && status !== "denied" && status !== "error";
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
    if (status === "approved" || status === "denied" || status === "error") return;

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
    } else if (deviceCodeInfo === null) {
      setStatus("error");
      setErrorMessage("Invalid or expired device code");
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
    setErrorMessage("");
    try {
      await approveDevice({ user_code: userCode });
      trackWebEvent("web_device_approved");
      setStatus("approved");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to approve");
    }
  };

  const handleDeny = async () => {
    setStatus("denying");
    setErrorMessage("");
    try {
      await denyDevice({ user_code: userCode });
      trackWebEvent("web_device_denied");
      setStatus("denied");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to deny");
    }
  };

  const renderContent = () => {
    if (status === "loading") {
      return (
        <div className="space-y-3">
          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            loading…
          </h1>
        </div>
      );
    }

    if (status === "error") {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            Authorization failed
          </h1>
          <StatusBox variant="error">{errorMessage}</StatusBox>
        </div>
      );
    }

    if (status === "approved") {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            Access granted
          </h1>
          <StatusBox variant="success">
            You can close this window and return to your terminal.
          </StatusBox>
        </div>
      );
    }

    if (status === "denied") {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            Access denied
          </h1>
          <StatusBox variant="info">You can close this window.</StatusBox>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
            Authorize CLI access
          </h1>
          <p className="text-sm text-muted-foreground" style={authSubtitleStyle}>
            The Relic CLI is requesting access to your account
          </p>
        </div>

        <StatusBox variant="info">
          Make sure the code below matches the one shown in your terminal.
        </StatusBox>

        <div className="bg-muted/20 border-2 border-border p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">User Code</p>
            <p className="text-2xl font-mono font-medium text-foreground">{userCode}</p>
          </div>

          {deviceCodeInfo?.clientId && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Client</p>
              <p className="text-sm text-foreground">{deviceCodeInfo.clientId}</p>
            </div>
          )}

          {deviceCodeInfo?.scope && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Permissions</p>
              <p className="text-sm text-foreground">{deviceCodeInfo.scope}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={status === "approving" || status === "denying"}
            className="flex-1 h-12 bg-foreground text-background border-2 border-foreground font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "approving" ? "Approving…" : "Approve"}
          </button>

          <button
            type="button"
            onClick={handleDeny}
            disabled={status === "approving" || status === "denying"}
            className="flex-1 h-12 bg-background text-foreground border-2 border-border font-medium transition-all hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "denying" ? "Denying…" : "Deny"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "approved" && "Device access approved successfully"}
        {status === "denied" && "Device access denied"}
        {status === "error" && errorMessage}
      </output>
      <div className="w-full max-w-md px-6 py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/relic-logo-dark.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto dark:hidden"
            />
            <Image
              src="/relic-logo-light.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto hidden dark:block"
            />
          </Link>

          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function ErrorFallback({ error }: { error: Error }) {
  // Parse error message from ConvexError
  let displayMessage = "Invalid or expired device code";
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.message) {
      displayMessage = parsed.message;
    }
  } catch {
    if (error.message.includes("DEVICE_CODE_NOT_FOUND")) {
      displayMessage = "Invalid or expired device code";
    } else if (error.message) {
      displayMessage = error.message;
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-6 py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/relic-logo-dark.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto dark:hidden"
            />
            <Image
              src="/relic-logo-light.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto hidden dark:block"
            />
          </Link>

          <div className="space-y-6">
            <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
              Authorization failed
            </h1>
            <StatusBox variant="error">{displayMessage}</StatusBox>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
          <div className="w-full max-w-md px-6 py-16">
            <div className="flex flex-col gap-8">
              <Link href="/" className="flex items-center">
                <Image
                  src="/relic-logo-dark.svg"
                  alt="Relic"
                  width={40}
                  height={40}
                  className="h-10 w-auto dark:hidden"
                />
                <Image
                  src="/relic-logo-light.svg"
                  alt="Relic"
                  width={40}
                  height={40}
                  className="h-10 w-auto hidden dark:block"
                />
              </Link>
              <div className="space-y-3">
                <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
                  loading…
                </h1>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ConvexErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
        <AuthorizeContent />
      </ConvexErrorBoundary>
    </Suspense>
  );
}
