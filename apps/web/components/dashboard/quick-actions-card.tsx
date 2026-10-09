import { ArrowUpRight, BookOpen, Download, Mail, Radio } from "lucide-react";
import { InstallSection } from "@/components/install-section";
import { SITE_DOCS_URL, SITE_RELEASES_URL, SITE_STATUS_URL } from "@/lib/site";
import { focusRing } from "@/lib/styles";
import { CommandLine, DashboardCard } from "./primitives";

const COMMANDS = [
  { command: "relic init", hint: "Link the current directory to a project" },
  { command: "relic run -e production -- npm start", hint: "Run with secrets injected" },
  { command: "relic upgrade", hint: "Update the CLI" },
] as const;

const LINKS = [
  { href: SITE_DOCS_URL, label: "Documentation", icon: BookOpen, external: true },
  { href: SITE_RELEASES_URL, label: "Download binaries", icon: Download, external: true },
  { href: SITE_STATUS_URL, label: "System status", icon: Radio, external: true },
  { href: "mailto:support@withrelic.com", label: "Email support", icon: Mail, external: false },
] as const;

export function QuickActionsCard() {
  return (
    <DashboardCard
      eyebrow="cli"
      title="Command line"
      description={
        <>
          Run <code className="font-mono text-foreground">relic</code> to open the TUI and manage
          projects and secrets.
        </>
      }
    >
      <div className="space-y-5">
        <InstallSection showWrapper={false} compact />

        <div className="space-y-2">
          <h3 className="text-xs font-medium text-foreground/70">Common commands</h3>
          <ul className="space-y-2">
            {COMMANDS.map(({ command, hint }) => (
              <li key={command} className="space-y-1">
                <CommandLine command={command} />
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </li>
            ))}
          </ul>
        </div>

        <nav
          aria-label="Help and resources"
          className="-mx-4 -mb-4 border-t border-border sm:-mx-5 sm:-mb-5"
        >
          <ul className="divide-y divide-border">
            {LINKS.map(({ href, label, icon: Icon, external }) => (
              <li key={href}>
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className={`group flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground sm:px-5 ${focusRing}`}
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">
                    {label}
                    {external && <span className="sr-only"> (opens in a new tab)</span>}
                  </span>
                  <ArrowUpRight
                    className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </DashboardCard>
  );
}
