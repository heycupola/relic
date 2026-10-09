import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { runArgs, type RunTarget } from "./core/args";
import {
  bunAttachUrl,
  bunCommand,
  nodeLaunchConfig,
  pythonCommand,
  readRelicDebugSettings,
  runtimeForDebugType,
  UnsupportedDebugConfigError,
} from "./core/debugPlan";
import { DEBUG_HOST, findFreePort, waitForPort } from "./core/net";
import type { RelicService } from "./relic";

export const DEBUG_TYPES = ["node", "pwa-node", "bun", "debugpy", "python"];

const SESSION_KEY = "__relicSession";
const BUN_EXTENSION = "oven.bun-vscode";
const PYTHON_DEBUG_EXTENSION = "ms-python.debugpy";

type Config = vscode.DebugConfiguration & Record<string, unknown>;

export class RelicDebugProvider implements vscode.DebugConfigurationProvider, vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly relic: RelicService) {
    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession((session) => {
        const id = session.configuration[SESSION_KEY];
        if (typeof id !== "string") return;
        const terminal = this.terminals.get(id);
        this.terminals.delete(id);
        if (terminal && terminal.exitStatus === undefined) terminal.dispose();
      }),
    );
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration | undefined> {
    const settings = readRelicDebugSettings(config.relic);
    if (!settings) return config;

    const runtime = runtimeForDebugType(config.type);
    if (!runtime || config.request !== "launch") {
      void vscode.window.showWarningMessage(
        `Relic: "relic" is only supported on launch configurations for Node.js, Bun, and Python. Starting "${config.name}" without secrets.`,
      );
      return config;
    }

    const program =
      typeof config.program === "string" ? vscode.Uri.file(config.program) : undefined;
    const project =
      this.relic.projects.forUri(program) ??
      (folder ? this.relic.projects.forUri(folder.uri) : undefined) ??
      this.relic.projects.active();
    if (!project) {
      void vscode.window.showErrorMessage(
        "Relic: no relic.toml found for this debug configuration.",
      );
      return undefined;
    }

    const target = await this.relic.target(project, settings);
    if (!target) return undefined;

    const cwd = typeof config.cwd === "string" && config.cwd ? config.cwd : project.root.fsPath;

    try {
      switch (runtime) {
        case "node":
          return nodeLaunchConfig(config as Config, {
            cliPath: this.relic.cli.path,
            target,
            port: await findFreePort(),
            platform: process.platform,
          });
        case "bun":
          return await this.launchBun(config as Config, target, cwd, token);
        case "python":
          return await this.launchPython(folder, config as Config, target, cwd, token);
      }
    } catch (err) {
      if (err instanceof UnsupportedDebugConfigError) {
        void vscode.window.showErrorMessage(`Relic: ${err.message}`);
        return undefined;
      }
      throw err;
    }
  }

  private async launchBun(
    config: Config,
    target: RunTarget,
    cwd: string,
    token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration | undefined> {
    const port = await findFreePort();
    const command = bunCommand(config, { port, platform: process.platform });
    const id = await this.startDebuggee(config, target, cwd, command, token, (isCancelled) =>
      waitForPort(port, { isCancelled }),
    );
    if (!id) return undefined;
    return {
      type: "bun",
      request: "attach",
      name: config.name,
      url: bunAttachUrl(port),
      [SESSION_KEY]: id,
    };
  }

  private async launchPython(
    folder: vscode.WorkspaceFolder | undefined,
    config: Config,
    target: RunTarget,
    cwd: string,
    token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration | undefined> {
    const port = await findFreePort();
    const readyFile = path.join(tmpdir(), `relic-debugpy-${randomUUID()}.ready`);
    const command = pythonCommand(config, {
      python: await resolvePython(folder, config),
      debugpyLibs: bundledDebugpyLibs(),
      port,
      readyFile,
      platform: process.platform,
    });

    const id = await this.startDebuggee(
      config,
      target,
      cwd,
      command,
      token,
      async (isCancelled) => {
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline && !isCancelled()) {
          if (existsSync(readyFile)) return true;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
      },
    );
    rmSync(readyFile, { force: true });
    if (!id) return undefined;

    return {
      type: config.type,
      request: "attach",
      name: config.name,
      connect: { host: DEBUG_HOST, port },
      justMyCode: config.justMyCode ?? true,
      ...(config.subProcess !== undefined ? { subProcess: config.subProcess } : {}),
      [SESSION_KEY]: id,
    };
  }

  private async startDebuggee(
    config: Config,
    target: RunTarget,
    cwd: string,
    command: string[],
    token: vscode.CancellationToken | undefined,
    ready: (isCancelled: () => boolean) => Promise<boolean>,
  ): Promise<string | undefined> {
    const id = randomUUID();
    const env =
      config.env && typeof config.env === "object"
        ? Object.fromEntries(
            Object.entries(config.env as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : undefined;

    const terminal = vscode.window.createTerminal({
      name: `Relic debug: ${config.name}`,
      shellPath: this.relic.cli.path,
      shellArgs: runArgs(target, command),
      cwd,
      env,
      iconPath: new vscode.ThemeIcon("debug-alt"),
    });
    terminal.show(true);

    const isReady = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Relic: starting "${config.name}" with ${target.environment} secrets…`,
        cancellable: true,
      },
      (_progress, progressToken) =>
        ready(
          () =>
            progressToken.isCancellationRequested ||
            !!token?.isCancellationRequested ||
            terminal.exitStatus !== undefined,
        ),
    );

    if (!isReady) {
      if (terminal.exitStatus === undefined) terminal.dispose();
      else {
        void vscode.window.showErrorMessage(
          `Relic: "${config.name}" exited before the debugger could attach. Check the terminal for details.`,
        );
      }
      return undefined;
    }

    this.terminals.set(id, terminal);
    return id;
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    for (const terminal of this.terminals.values()) terminal.dispose();
  }
}

function bundledDebugpyLibs(): string | undefined {
  const extension = vscode.extensions.getExtension(PYTHON_DEBUG_EXTENSION);
  if (!extension) return undefined;
  const libs = path.join(extension.extensionPath, "bundled", "libs");
  return existsSync(path.join(libs, "debugpy")) ? libs : undefined;
}

async function resolvePython(
  folder: vscode.WorkspaceFolder | undefined,
  config: Config,
): Promise<string | string[]> {
  if (typeof config.python === "string" && config.python) return config.python;
  if (Array.isArray(config.python) && config.python.length > 0) return config.python as string[];
  try {
    const interpreter = await vscode.commands.executeCommand<string | undefined>(
      "python.interpreterPath",
      { workspaceFolder: folder?.uri.fsPath },
    );
    if (interpreter) return interpreter;
  } catch {
    // The Python extension is optional.
  }
  return process.platform === "win32" ? "python" : "python3";
}

interface RuntimeChoice extends vscode.QuickPickItem {
  config: { type: string } & Record<string, unknown>;
  extension?: string;
}

export async function debugCurrentFile(relic: RelicService): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    void vscode.window.showWarningMessage("Relic: open a file to debug first.");
    return;
  }
  const document = editor.document;
  const project = relic.projects.forUri(document.uri) ?? relic.projects.active();
  if (!project) {
    void vscode.window.showWarningMessage("Relic: no relic.toml found for this file.");
    return;
  }
  if (document.isDirty) await document.save();

  const file = document.uri.fsPath;
  const isTypeScript = document.languageId.startsWith("typescript");
  const hasBunLock =
    existsSync(path.join(project.root.fsPath, "bun.lock")) ||
    existsSync(path.join(project.root.fsPath, "bun.lockb"));

  let choices: RuntimeChoice[];
  if (document.languageId === "python") {
    choices = [{ label: "Python", config: { type: "debugpy" }, extension: PYTHON_DEBUG_EXTENSION }];
  } else if (/^(javascript|typescript)/.test(document.languageId)) {
    const node: RuntimeChoice = { label: "Node.js", config: { type: "node" } };
    const tsx: RuntimeChoice = {
      label: "Node.js via tsx",
      description: "needs tsx on PATH",
      config: { type: "node", runtimeExecutable: "tsx" },
    };
    const bun: RuntimeChoice = { label: "Bun", config: { type: "bun" }, extension: BUN_EXTENSION };
    choices = hasBunLock
      ? [bun, node, ...(isTypeScript ? [tsx] : [])]
      : [node, ...(isTypeScript ? [tsx] : []), bun];
  } else {
    void vscode.window.showWarningMessage(
      "Relic: debugging with secrets supports JavaScript, TypeScript, and Python files.",
    );
    return;
  }

  const choice =
    choices.length === 1
      ? choices[0]
      : await vscode.window.showQuickPick(choices, { placeHolder: "Debug with which runtime?" });
  if (!choice) return;

  if (choice.extension && !vscode.extensions.getExtension(choice.extension)) {
    const action = await vscode.window.showWarningMessage(
      `Debugging with ${choice.label} needs the ${choice.extension} extension.`,
      "Show Extension",
    );
    if (action) {
      await vscode.commands.executeCommand("workbench.extensions.search", choice.extension);
    }
    return;
  }

  await vscode.debug.startDebugging(project.workspaceFolder, {
    ...choice.config,
    request: "launch",
    name: `Relic: ${path.basename(file)}`,
    program: file,
    cwd: project.root.fsPath,
    relic: true,
  });
}
