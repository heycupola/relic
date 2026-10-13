import { InstallSection } from "@/components/install-section";
import { CommandLine, DashboardCard } from "./primitives";

const COMMANDS = [
  { command: "relic init", hint: "Link the current directory to a project" },
  { command: "relic run -e production -- npm start", hint: "Run with secrets injected" },
  { command: "relic upgrade", hint: "Update the CLI" },
] as const;

function Command({ command, hint }: { command: string; hint: string }) {
  return (
    <li className="space-y-1">
      <CommandLine command={command} />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </li>
  );
}

export function QuickActionsCard() {
  return (
    <DashboardCard
      title="Command line"
      description={
        <>
          Run <code className="font-mono text-foreground">relic</code> to open the TUI and manage
          projects and secrets.
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-medium text-foreground/70">Install</h3>
          <InstallSection showWrapper={false} compact />
          <ul className="pt-1">
            <Command command="relic login" hint="Sign in from your terminal" />
          </ul>
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-medium text-foreground/70">Common commands</h3>
          <ul className="space-y-2">
            {COMMANDS.map(({ command, hint }) => (
              <Command key={command} command={command} hint={hint} />
            ))}
          </ul>
        </div>
      </div>
    </DashboardCard>
  );
}
