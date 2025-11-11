"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { AutumnProvider } from "autumn-js/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  expectAuth: true,
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <AutumnProvider convex={convex} convexApi={api.autumn}>
        {children}
      </AutumnProvider>
    </ConvexBetterAuthProvider>
  );
}
