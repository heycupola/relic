import * as path from "node:path";
import * as vscode from "vscode";
import {
  runArgs,
  runCommandLine,
  type RunTarget,
  type SecretScope,
  shellKindFor,
} from "./core/args";
import {
  detectPackageManager,
  type PackageManager,
  readScripts,
  scriptCommand,
} from "./core/packageManager";
import type { RelicProject } from "./projects";
import type { RelicService } from "./relic";

export const TASK_TYPE = "relic";
export const TASK_ENVIRONMENT_COMMAND = "relic.taskEnvironment";

interface RelicTaskDefinition extends vscode.TaskDefinition {
  script?: string;
  command?: string | string[];
  path?: string;
  environment?: string;
  folder?: string;
  scope?: SecretScope;
}

const LOCKFILES = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"];

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function lockfilesFor(dir: string, stopAt: string): Promise<string[]> {
  const found: string[] = [];
  let current = dir;
  while (true) {
    for (const name of LOCKFILES) {
      if (await exists(vscode.Uri.file(path.join(current, name)))) found.push(name);
    }
    if (found.length > 0 || current === stopAt) return found;
    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(stopAt)) return found;
    current = parent;
  }
}

export class RelicTaskProvider implements vscode.TaskProvider {
  constructor(private readonly relic: RelicService) {}

  private target(definition: RelicTaskDefinition): RunTarget {
    return {
      environment: definition.environment || `\${command:${TASK_ENVIRONMENT_COMMAND}}`,
      folder: definition.folder,
      scope: definition.scope,
    };
  }

  private execution(
    definition: RelicTaskDefinition,
    cwd: string,
    packageManager: PackageManager = "npm",
  ): vscode.ShellExecution | undefined {
    const cli = this.relic.cli.path;
    const target = this.target(definition);

    if (definition.script) {
      return new vscode.ShellExecution(
        cli,
        runArgs(target, scriptCommand(packageManager, definition.script)),
        {
          cwd,
        },
      );
    }
    if (Array.isArray(definition.command) && definition.command.length > 0) {
      return new vscode.ShellExecution(cli, runArgs(target, definition.command), { cwd });
    }
    if (typeof definition.command === "string" && definition.command.trim()) {
      return new vscode.ShellExecution(
        runCommandLine(
          cli,
          target,
          definition.command,
          shellKindFor(process.platform, vscode.env.shell),
        ),
        { cwd },
      );
    }
    return undefined;
  }

  private async packageManagerFor(dir: string, project: RelicProject): Promise<PackageManager> {
    const stopAt = project.workspaceFolder?.uri.fsPath ?? project.root.fsPath;
    let declared: string | undefined;
    try {
      const content = await vscode.workspace.fs.readFile(
        vscode.Uri.file(path.join(dir, "package.json")),
      );
      declared = readScripts(new TextDecoder().decode(content)).packageManager;
    } catch {
      declared = undefined;
    }
    return detectPackageManager(await lockfilesFor(dir, stopAt), declared);
  }

  async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
    if (!vscode.workspace.getConfiguration("relic").get<boolean>("tasks.packageScripts", true)) {
      return [];
    }

    const tasks: vscode.Task[] = [];
    for (const project of this.relic.projects.all) {
      const packageFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(project.root, "**/package.json"),
        "**/node_modules/**",
        100,
        token,
      );

      for (const packageFile of packageFiles) {
        if (this.relic.projects.forUri(packageFile) !== project) continue;
        const dir = path.dirname(packageFile.fsPath);
        let scripts: string[];
        try {
          scripts = readScripts(
            new TextDecoder().decode(await vscode.workspace.fs.readFile(packageFile)),
          ).scripts;
        } catch {
          continue;
        }
        if (scripts.length === 0) continue;

        const manager = await this.packageManagerFor(dir, project);
        const scope = project.workspaceFolder ?? vscode.TaskScope.Workspace;
        const relativeDir = project.workspaceFolder
          ? path.relative(project.workspaceFolder.uri.fsPath, dir)
          : dir;

        for (const script of scripts) {
          const definition: RelicTaskDefinition = {
            type: TASK_TYPE,
            script,
            ...(relativeDir ? { path: relativeDir.split(path.sep).join("/") } : {}),
          };
          const task = new vscode.Task(
            definition,
            scope,
            relativeDir ? `${script} - ${relativeDir}` : script,
            TASK_TYPE,
            this.execution(definition, dir, manager),
          );
          task.detail = `relic run -- ${scriptCommand(manager, script).join(" ")}`;
          if (/^(build|compile)(:|$)/.test(script)) task.group = vscode.TaskGroup.Build;
          if (/^test(:|$)/.test(script)) task.group = vscode.TaskGroup.Test;
          tasks.push(task);
        }
      }
    }
    return tasks;
  }

  async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
    const definition = task.definition as RelicTaskDefinition;
    const folder =
      task.scope && typeof task.scope === "object"
        ? (task.scope as vscode.WorkspaceFolder)
        : undefined;
    const base = folder?.uri.fsPath ?? this.relic.projects.active()?.root.fsPath;
    if (!base) return undefined;

    const cwd = definition.path ? path.resolve(base, definition.path) : base;
    const project =
      this.relic.projects.forUri(vscode.Uri.file(cwd)) ?? this.relic.projects.active();
    const manager =
      project && definition.script ? await this.packageManagerFor(cwd, project) : undefined;
    const execution = this.execution(definition, cwd, manager);
    if (!execution) {
      void vscode.window.showErrorMessage(
        `Relic task "${task.name}" needs a "script" or a "command".`,
      );
      return undefined;
    }

    return new vscode.Task(
      definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      TASK_TYPE,
      execution,
    );
  }
}

/** Resolves `${command:relic.taskEnvironment}` when a task runs. */
export async function taskEnvironment(relic: RelicService): Promise<string | undefined> {
  const project = relic.projects.active();
  if (!project) return undefined;
  return relic.ensureEnvironment(project);
}
