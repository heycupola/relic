"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { authClient } from "@/lib/auth";
import { isValidReturnUrl } from "@/lib/url";

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");

  useEffect(() => {
    if (pathname !== "/login") return;

    authClient.getSession().then((session) => {
      if (session?.data?.user.id) {
        const redirectTo = isValidReturnUrl(returnUrl) ? returnUrl : "/";
        if (redirectTo) {
          router.replace(redirectTo);
        }
      }
    });
  }, [router, returnUrl, pathname]);

  return <>{children}</>;
}
