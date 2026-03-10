"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { authClient } from "@/lib/auth";

function ProtectedContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      const params = searchParams.toString();
      const returnUrl = params ? `${pathname}?${params}` : pathname;
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }, [session, isPending, router, pathname, searchParams]);

  if (isPending || !session?.user) {
    return null;
  }

  return <>{children}</>;
}

interface ProtectedLayoutClientProps {
  children: React.ReactNode;
}

export function ProtectedLayoutClient({ children }: ProtectedLayoutClientProps) {
  return (
    <Suspense fallback={null}>
      <ProtectedContent>{children}</ProtectedContent>
    </Suspense>
  );
}
