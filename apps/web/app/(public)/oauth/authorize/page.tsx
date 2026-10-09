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
import {
  authHeadingStyle,
  authSubtitleStyle,
  focusRing,
  primaryButton,
  secondaryButton,
} from "@/lib/styles";

type AuthStatus = "loading" | "ready" | "approving" | "denying" | "approved" | "denied" | "error";

const BUSY_OR_FINAL: ReadonlySet<AuthStatus> = new Set([
  "approving",
  "denying",
  "approved",
  "denied",
  "error",
]);

function authorizePath(userCode: string) {
  return `/oauth/authorize?user_code=${encodeURIComponent(userCode)}`;
}

function loginPathFor(userCode: string) {
  return `/login?returnUrl=${encodeURIComponent(authorizePath(userCode))}`;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
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

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return this.props.children;
  }
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className={`flex w-fit items-center ${focusRing}`}>
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
          {children}
        </div>
      </div>
    </div>
  );
}

function LoadingHeading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
        Loading…
      </h1>
    </div>
  );
}

function ErrorContent({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
        Authorization failed
      </h1>
      <StatusBox variant="error">{message}</StatusBox>
      <div className="space-y-3">
        <button type="button" onClick={onRetry} className={`w-full h-11 sm:h-12 ${primaryButton}`}>
          Try again
        </button>
        <p className="text-xs text-muted-foreground text-pretty">
          If the code has expired, run{" "}
          <code className="font-mono text-foreground">relic login</code> in your terminal to get a
          new one.
        </p>
      </div>
    </div>
  );
}

function AuthorizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("user_code") || "";
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSwitching, setIsSwitching] = useState(false);

  const shouldQuery =
    userCode && status !== "approved" && status !== "denied" && status !== "error";
  const deviceCodeInfo = useQuery(
    api.deviceAuth.getDeviceCodeInfo,
    shouldQuery ? { user_code: userCode } : "skip",
  );
  const approveDevice = useMutation(api.deviceAuth.approveDeviceCode);
  const denyDevice = useMutation(api.deviceAuth.denyDeviceCode);

  const sessionChecked = !sessionPending;

  useEffect(() => {
    if (BUSY_OR_FINAL.has(status) || isSwitching) return;

    if (!sessionChecked || authLoading) {
      setStatus("loading");
      return;
    }

    if (!userCode) {
      setStatus("error");
      setErrorMessage("No user code provided");
      return;
    }

    if (!session?.user) {
      router.replace(loginPathFor(userCode));
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
  }, [
    deviceCodeInfo,
    userCode,
    status,
    sessionChecked,
    isAuthenticated,
    authLoading,
    session,
    router,
    isSwitching,
  ]);

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

  const handleRetry = () => {
    setErrorMessage("");
    setStatus("loading");
  };

  const handleSwitchAccount = async () => {
    setIsSwitching(true);
    try {
      await authClient.signOut();
    } catch {
      // Fall through to the login page; it will show whichever session is still active.
    }
    router.replace(loginPathFor(userCode));
  };

  const isBusy = status === "approving" || status === "denying";

  const renderContent = () => {
    if (status === "loading" || isSwitching) {
      return <LoadingHeading />;
    }

    if (status === "error") {
      return <ErrorContent message={errorMessage} onRetry={handleRetry} />;
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
            The Relic CLI is requesting access to your account.
          </p>
        </div>

        <StatusBox variant="info">
          Make sure the code below matches the one shown in your terminal.
        </StatusBox>

        <dl className="ph-no-capture bg-muted/20 border-2 border-border p-4 space-y-4 sm:p-6">
          <div className="space-y-2">
            <dt className="text-xs font-medium text-muted-foreground uppercase">User code</dt>
            <dd className="text-2xl font-mono font-medium text-foreground">{userCode}</dd>
          </div>

          {session?.user.email && (
            <div className="space-y-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase">Signed in as</dt>
              <dd className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-mono text-sm text-foreground break-all">
                  {session.user.email}
                </span>
                <button
                  type="button"
                  onClick={() => void handleSwitchAccount()}
                  disabled={isBusy}
                  className={`text-xs text-muted-foreground underline underline-offset-4 decoration-border hover:text-foreground hover:decoration-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
                >
                  Not you? Switch account
                </button>
              </dd>
            </div>
          )}

          {deviceCodeInfo?.clientId && (
            <div className="space-y-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase">Client</dt>
              <dd className="text-sm text-foreground">{deviceCodeInfo.clientId}</dd>
            </div>
          )}

          {deviceCodeInfo?.scope && (
            <div className="space-y-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase">Permissions</dt>
              <dd className="text-sm text-foreground">{deviceCodeInfo.scope}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isBusy}
            aria-busy={status === "approving"}
            className={`flex-1 h-11 sm:h-12 ${primaryButton}`}
          >
            {status === "approving" ? "Approving…" : "Approve"}
          </button>

          <button
            type="button"
            onClick={handleDeny}
            disabled={isBusy}
            aria-busy={status === "denying"}
            className={`flex-1 h-11 font-medium sm:h-12 ${secondaryButton}`}
          >
            {status === "denying" ? "Denying…" : "Deny"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {status === "approved" && "Device access approved successfully"}
        {status === "denied" && "Device access denied"}
        {status === "error" && errorMessage}
      </output>
      <AuthShell>{renderContent()}</AuthShell>
    </>
  );
}

function getBoundaryMessage(error: Error) {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.message) return String(parsed.message);
  } catch {
    if (error.message.includes("DEVICE_CODE_NOT_FOUND")) return "Invalid or expired device code";
    if (error.message) return error.message;
  }
  return "Invalid or expired device code";
}

export default function AuthorizePage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <LoadingHeading />
        </AuthShell>
      }
    >
      <ConvexErrorBoundary
        fallback={(error, reset) => (
          <AuthShell>
            <ErrorContent message={getBoundaryMessage(error)} onRetry={reset} />
          </AuthShell>
        )}
      >
        <AuthorizeContent />
      </ConvexErrorBoundary>
    </Suspense>
  );
}
