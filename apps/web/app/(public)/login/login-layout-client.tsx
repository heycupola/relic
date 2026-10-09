"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { authClient } from "@/lib/auth";
import { getSafeReturnPath } from "@/lib/url";

function LayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");

  useEffect(() => {
    authClient
      .getSession()
      .then((session) => {
        if (session?.data?.user.id) {
          router.replace(getSafeReturnPath(returnUrl) ?? "/dashboard");
        }
      })
      .catch(() => {
        // Stay on the login page; signing in again will establish a session.
      });
  }, [router, returnUrl]);

  return <>{children}</>;
}

interface LoginLayoutClientProps {
  children: React.ReactNode;
}

export function LoginLayoutClient({ children }: LoginLayoutClientProps) {
  return (
    <Suspense fallback={null}>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}
