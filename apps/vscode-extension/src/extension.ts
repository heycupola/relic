import * as vscode from "vscode";
import { DEBUG_TYPES, debugCurrentFile, RelicDebugProvider } from "./debug";
import {
  copySecretGuidance,
  ignoreVariable,
  MissingSecretActions,
  SecretDiagnostics,
} from "./diagnostics";
import { ProjectRegistry } from "./projects";
import { DOCS_URL, INSTALL_URL, RelicService } from "./relic";
import { RelicStatusBar } from "./statusBar";
import { RelicTaskProvider, TASK_ENVIRONMENT_COMMAND, TASK_TYPE, taskEnvironment } from "./tasks";
import {
  cliTerminal,
  RelicShellProfileProvider,
  sendRunCommand,
  shellTerminalOptions,
} from "./terminals";

const LAST_COMMAND_KEY = "relic.lastRunCommand";

const SCANNED_LANGUAGES = [
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
  "vue",
  "svelte",
  "astro",
  "python",
];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const projects = new ProjectRegistry();
  const relic = new RelicService(context.workspaceState, projects);
  const debugProvider = new RelicDebugProvider(relic);

  const refresh = async () => {
    relic.invalidate();
    await relic.checkHealth();
  };

  const requireProject = async () => {
    const project = await projects.pick();
    if (!project) {
      void vscode.window.showWarningMessage(
        "No relic.toml found in this workspace. Run `relic init` in your project first.",
      );
    }
    return project;
  };

  context.subscriptions.push(
    projects,
    relic,
    debugProvider,
    new RelicStatusBar(relic),
    new SecretDiagnostics(relic),

    vscode.tasks.registerTaskProvider(TASK_TYPE, new RelicTaskProvider(relic)),
    vscode.window.registerTerminalProfileProvider(
      "relic.shell",
      new RelicShellProfileProvider(relic),
    ),
    vscode.languages.registerCodeActionsProvider(
      SCANNED_LANGUAGES.map((language) => ({ language, scheme: "file" })),
      new MissingSecretActions(relic),
      MissingSecretActions.metadata,
    ),
    ...DEBUG_TYPES.map((type) =>
      vscode.debug.registerDebugConfigurationProvider(type, debugProvider),
    ),

    vscode.commands.registerCommand("relic.selectEnvironment", async () => {
      const project = await requireProject();
      if (project) await relic.pickEnvironment(project);
    }),

    vscode.commands.registerCommand("relic.runWithSecrets", async (command?: unknown) => {
      const project = await requireProject();
      if (!project) return;
      const target = await relic.target(project);
      if (!target) return;

      let line = typeof command === "string" ? command : undefined;
      if (!line) {
        line = await vscode.window.showInputBox({
          title: `Run with Relic secrets (${target.environment})`,
          prompt: "Command to run through `relic run`",
          placeHolder: "npm run dev",
          value: context.workspaceState.get<string>(LAST_COMMAND_KEY),
        });
      }
      if (!line?.trim()) return;
      await context.workspaceState.update(LAST_COMMAND_KEY, line);
      sendRunCommand(relic, project, target, line);
    }),

    vscode.commands.registerCommand("relic.debugWithSecrets", () => debugCurrentFile(relic)),

    vscode.commands.registerCommand("relic.openShell", async () => {
      const project = await requireProject();
      if (!project) return;
      const target = await relic.target(project);
      if (!target) return;
      vscode.window.createTerminal(await shellTerminalOptions(relic, project, target)).show();
    }),

    vscode.commands.registerCommand("relic.openTui", () => {
      const project = projects.active();
      cliTerminal(relic, {
        name: "Relic",
        args: [],
        cwd: project?.root,
        onExit: () => relic.invalidate(),
      }).show();
    }),

    vscode.commands.registerCommand("relic.login", () => {
      cliTerminal(relic, {
        name: "Relic: login",
        args: ["login"],
        cwd: projects.active()?.root,
        onExit: () => void refresh(),
      }).show();
    }),

    vscode.commands.registerCommand("relic.refresh", refresh),

    vscode.commands.registerCommand("relic.showSetup", async () => {
      const health = relic.health;
      if (health.kind === "not_installed") {
        const action = await vscode.window.showWarningMessage(
          `The Relic CLI was not found ("${relic.cli.path}"). Install it, or set "relic.cliPath" if it lives outside your PATH.`,
          "Install Guide",
          "Set CLI Path",
          "Retry",
        );
        if (action === "Install Guide")
          await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
        if (action === "Set CLI Path") {
          await vscode.commands.executeCommand("workbench.action.openSettings", "relic.cliPath");
        }
        if (action === "Retry") await refresh();
        return;
      }
      if (health.kind === "outdated") {
        const action = await vscode.window.showWarningMessage(
          health.message,
          "Upgrade CLI",
          "Retry",
        );
        if (action === "Upgrade CLI") {
          cliTerminal(relic, {
            name: "Relic: upgrade",
            args: ["upgrade"],
            onExit: () => void refresh(),
          }).show();
        }
        if (action === "Retry") await refresh();
        return;
      }
      if (health.kind === "not_logged_in") {
        await vscode.commands.executeCommand("relic.login");
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
    }),

    vscode.commands.registerCommand("relic.copySecretGuidance", copySecretGuidance),
    vscode.commands.registerCommand("relic.ignoreVariable", ignoreVariable),
    vscode.commands.registerCommand(TASK_ENVIRONMENT_COMMAND, () => taskEnvironment(relic)),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("relic.cliPath")) void refresh();
    }),
    projects.onDidChange(() => void refresh()),
  );

  await projects.reload();
}

export function deactivate(): void {}
