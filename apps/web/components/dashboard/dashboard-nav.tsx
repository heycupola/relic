"use client";

import { api } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { useQuery } from "convex/react";
import { LayoutGrid, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth";
import { focusRing } from "@/lib/styles";
import { PlanBadge } from "./primitives";

const TABS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardNav() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const user = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");

  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-12">
        <nav aria-label="Dashboard" className="-mb-px flex">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors first:-ml-3",
                  focusRing,
                  active
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        {user && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
              {user.email}
            </span>
            <PlanBadge hasPro={user.hasPro} />
          </div>
        )}
      </div>
    </div>
  );
}
