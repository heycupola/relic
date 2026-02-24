"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { api } from "@repo/backend";
import { AutumnProvider } from "autumn-js/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/lib/auth";
import { initPostHog } from "@/lib/posthog";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  expectAuth: true,
});

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return <>{children}</>;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autumnApi = (api as any)?.autumn;

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      {autumnApi ? (
        <AutumnProvider convex={convex} convexApi={autumnApi}>
          {children}
        </AutumnProvider>
      ) : (
        children
      )}
    </ConvexBetterAuthProvider>
  );
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
