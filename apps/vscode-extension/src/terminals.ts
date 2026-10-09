import * as vscode from "vscode";
import { runCommandLine, type RunTarget, shellArgs, shellKindFor } from "./core/args";
import type { RelicProject } from "./projects";
import type { RelicService } from "./relic";

const ICON = new vscode.ThemeIcon("lock");

export function cliTerminal(
  relic: RelicService,
  options: { name: string; args: string[]; cwd?: vscode.Uri; onExit?: () => void },
): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: options.name,
    shellPath: relic.cli.path,
    shellArgs: options.args,
    cwd: options.cwd,
    iconPath: ICON,
  });
  if (options.onExit) {
    const listener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return;
      listener.dispose();
      options.onExit?.();
    });
  }
  return terminal;
}

export async function shellTerminalOptions(
  relic: RelicService,
  project: RelicProject,
  target: RunTarget,
): Promise<vscode.TerminalOptions> {
  if (await relic.cli.supports("shell")) {
    return {
      name: `Relic: ${target.environment}`,
      shellPath: relic.cli.path,
      shellArgs: shellArgs(target),
      cwd: project.root,
      iconPath: ICON,
    };
  }

  const example = runCommandLine(
    relic.cli.path,
    target,
    "<command>",
    shellKindFor(process.platform),
  );
  return {
    name: `Relic: ${target.environment} (prefix)`,
    cwd: project.root,
    iconPath: ICON,
    message: [
      `\x1b[33mThis Relic CLI has no \`relic shell\` yet, so this is a plain shell.\x1b[0m`,
      `Run commands with secrets by prefixing them:  ${example}`,
      "Upgrade with `relic upgrade` to get a shell with secrets loaded.",
    ].join("\r\n"),
  };
}

export class RelicShellProfileProvider implements vscode.TerminalProfileProvider {
  constructor(private readonly relic: RelicService) {}

  async provideTerminalProfile(): Promise<vscode.TerminalProfile | undefined> {
    const project = await this.relic.projects.pick();
    if (!project) {
      void vscode.window.showWarningMessage("No relic.toml found in this workspace.");
      return undefined;
    }
    const target = await this.relic.target(project);
    if (!target) return undefined;
    return new vscode.TerminalProfile(await shellTerminalOptions(this.relic, project, target));
  }
}

const runTerminals = new Map<string, vscode.Terminal>();

export function sendRunCommand(
  relic: RelicService,
  project: RelicProject,
  target: RunTarget,
  command: string,
): void {
  const key = project.root.fsPath;
  let terminal = runTerminals.get(key);
  if (!terminal || terminal.exitStatus !== undefined) {
    terminal = vscode.window.createTerminal({
      name: "Relic: run",
      cwd: project.root,
      iconPath: ICON,
    });
    runTerminals.set(key, terminal);
    const listener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return;
      listener.dispose();
      runTerminals.delete(key);
    });
  }

  const shellPath = vscode.env.shell;
  terminal.show();
  terminal.sendText(
    runCommandLine(relic.cli.path, target, command, shellKindFor(process.platform, shellPath)),
  );
}
