import * as path from "node:path";
import * as vscode from "vscode";
import { CONFIG_FILE, parseProjectId } from "./core/config";

export interface RelicProject {
  projectId: string;
  root: vscode.Uri;
  configUri: vscode.Uri;
  workspaceFolder: vscode.WorkspaceFolder | undefined;
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export class ProjectRegistry implements vscode.Disposable {
  private projects: RelicProject[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  readonly onDidChange = this.emitter.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${CONFIG_FILE}`);
    watcher.onDidCreate(() => this.reload());
    watcher.onDidChange(() => this.reload());
    watcher.onDidDelete(() => this.reload());
    this.disposables.push(
      watcher,
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.reload()),
      this.emitter,
    );
  }

  get all(): readonly RelicProject[] {
    return this.projects;
  }

  async reload(): Promise<void> {
    const uris = await vscode.workspace.findFiles(`**/${CONFIG_FILE}`, "**/node_modules/**", 50);
    const projects: RelicProject[] = [];

    for (const configUri of uris) {
      try {
        const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(configUri));
        const projectId = parseProjectId(content);
        if (!projectId) continue;
        projects.push({
          projectId,
          configUri,
          root: vscode.Uri.file(path.dirname(configUri.fsPath)),
          workspaceFolder: vscode.workspace.getWorkspaceFolder(configUri),
        });
      } catch {
        // An unreadable relic.toml is treated as absent.
      }
    }

    projects.sort((a, b) => a.root.fsPath.length - b.root.fsPath.length);
    this.projects = projects;
    await vscode.commands.executeCommand("setContext", "relic.hasProject", projects.length > 0);
    this.emitter.fire();
  }

  forUri(uri: vscode.Uri | undefined): RelicProject | undefined {
    if (!uri || uri.scheme !== "file") return undefined;
    let match: RelicProject | undefined;
    for (const project of this.projects) {
      if (contains(project.root.fsPath, uri.fsPath)) {
        if (!match || project.root.fsPath.length > match.root.fsPath.length) match = project;
      }
    }
    return match;
  }

  active(): RelicProject | undefined {
    return this.forUri(vscode.window.activeTextEditor?.document.uri) ?? this.projects[0];
  }

  async pick(placeHolder = "Select a Relic project"): Promise<RelicProject | undefined> {
    if (this.projects.length <= 1) return this.projects[0];
    const active = this.active();
    const items = this.projects.map((project) => ({
      label:
        vscode.workspace.asRelativePath(project.root, true) || path.basename(project.root.fsPath),
      description: project === active ? "active" : undefined,
      project,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.project;
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
