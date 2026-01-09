"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { authClient } from "@/lib/auth";
import { isValidReturnUrl } from "@/lib/url";

interface LayoutContentProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutContentProps) {
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

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Suspense fallback={null}>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}
