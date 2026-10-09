import * as vscode from "vscode";
import type { RunTarget } from "./core/args";
import { type ProjectInfo, RelicCli, RelicCliError } from "./core/cli";
import type { ProjectRegistry, RelicProject } from "./projects";

export const INSTALL_URL = "https://docs.withrelic.com/introduction#installation";
export const DOCS_URL = "https://docs.withrelic.com/guides/editor";

const SECRET_NAMES_TTL_MS = 5 * 60_000;
const PREFERRED_DEFAULTS = ["development", "dev", "local"];

export type Health =
  | { kind: "checking" }
  | { kind: "ready"; version: string | null }
  | { kind: "not_installed" }
  | { kind: "not_logged_in" }
  | { kind: "outdated"; message: string }
  | { kind: "error"; message: string };

type Environments = ProjectInfo["environments"];

export class RelicService implements vscode.Disposable {
  readonly cli = new RelicCli(() =>
    vscode.workspace.getConfiguration("relic").get<string>("cliPath", "relic"),
  );

  private currentHealth: Health = { kind: "checking" };
  private pendingHealthCheck: Promise<void> | undefined;
  private readonly environmentCache = new Map<string, Promise<Environments>>();
  private readonly secretNameCache = new Map<string, { at: number; names: Promise<Set<string>> }>();

  private readonly healthEmitter = new vscode.EventEmitter<Health>();
  private readonly environmentEmitter = new vscode.EventEmitter<RelicProject>();
  private readonly namesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeHealth = this.healthEmitter.event;
  readonly onDidChangeEnvironment = this.environmentEmitter.event;
  readonly onDidChangeSecretNames = this.namesEmitter.event;

  constructor(
    private readonly state: vscode.Memento,
    readonly projects: ProjectRegistry,
  ) {}

  get health(): Health {
    return this.currentHealth;
  }

  private setHealth(health: Health): void {
    this.currentHealth = health;
    this.healthEmitter.fire(health);
  }

  private stateKey(project: RelicProject): string {
    return `relic.environment.${project.projectId}`;
  }

  getEnvironment(project: RelicProject): string | undefined {
    return this.state.get<string>(this.stateKey(project));
  }

  async setEnvironment(project: RelicProject, environment: string | undefined): Promise<void> {
    if (this.getEnvironment(project) === environment) return;
    await this.state.update(this.stateKey(project), environment);
    this.environmentEmitter.fire(project);
  }

  private markReady(): void {
    if (this.currentHealth.kind === "ready" || this.currentHealth.kind === "checking") return;
    this.setHealth({ kind: "ready", version: null });
  }

  recordError(err: unknown): Health {
    let health: Health;
    if (err instanceof RelicCliError) {
      switch (err.kind) {
        case "not_installed":
          health = { kind: "not_installed" };
          break;
        case "not_logged_in":
          health = { kind: "not_logged_in" };
          break;
        case "outdated":
          health = { kind: "outdated", message: err.message };
          break;
        default:
          return { kind: "error", message: err.message };
      }
    } else {
      return { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
    this.setHealth(health);
    return health;
  }

  checkHealth(): Promise<void> {
    if (!this.pendingHealthCheck) {
      this.pendingHealthCheck = this.runHealthCheck().finally(() => {
        this.pendingHealthCheck = undefined;
      });
    }
    return this.pendingHealthCheck;
  }

  private async runHealthCheck(): Promise<void> {
    this.setHealth({ kind: "checking" });
    let version: string | null;
    try {
      version = await this.cli.version();
    } catch (err) {
      const health = this.recordError(err);
      if (health.kind === "error") this.setHealth(health);
      return;
    }

    const project = this.projects.active();
    if (!project) {
      this.setHealth({ kind: "ready", version });
      return;
    }

    try {
      const environments = await this.environments(project, true);
      this.setHealth({ kind: "ready", version });
      await this.reconcileEnvironment(project, environments);
    } catch (err) {
      const health = this.recordError(err);
      if (health.kind === "error") this.setHealth({ kind: "ready", version });
    }
  }

  private async reconcileEnvironment(
    project: RelicProject,
    environments: Environments,
  ): Promise<void> {
    const current = this.getEnvironment(project);
    if (current && environments.some((env) => env.name === current)) return;

    const fallback =
      environments.length === 1
        ? environments[0]
        : environments.find((env) => PREFERRED_DEFAULTS.includes(env.name.toLowerCase()));
    await this.setEnvironment(project, fallback?.name);
  }

  environments(project: RelicProject, force = false): Promise<Environments> {
    let pending = force ? undefined : this.environmentCache.get(project.projectId);
    if (!pending) {
      pending = this.cli.project(project.projectId, project.root.fsPath).then((info) => {
        this.markReady();
        return info.environments;
      });
      pending.catch(() => this.environmentCache.delete(project.projectId));
      this.environmentCache.set(project.projectId, pending);
    }
    return pending;
  }

  async secretNames(project: RelicProject, environment: string): Promise<Set<string>> {
    const key = `${project.projectId}\0${environment}`;
    const cached = this.secretNameCache.get(key);
    if (cached && Date.now() - cached.at < SECRET_NAMES_TTL_MS) return cached.names;

    const names = this.cli
      .secretNames(project.projectId, environment, project.root.fsPath)
      .then((result) => {
        this.markReady();
        return new Set(result.secrets.map((secret) => secret.name));
      });
    names.catch(() => this.secretNameCache.delete(key));
    this.secretNameCache.set(key, { at: Date.now(), names });
    return names;
  }

  invalidate(): void {
    this.environmentCache.clear();
    this.secretNameCache.clear();
    this.cli.clearCapabilities();
    this.namesEmitter.fire();
  }

  async pickEnvironment(project: RelicProject): Promise<string | undefined> {
    let environments: Environments;
    try {
      environments = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Relic: loading environments" },
        () => this.environments(project),
      );
    } catch (err) {
      await this.showProblem(err);
      return undefined;
    }

    if (environments.length === 0) {
      void vscode.window.showWarningMessage(
        "This Relic project has no environments yet. Create one in the Relic TUI.",
      );
      return undefined;
    }

    const current = this.getEnvironment(project);
    const picked = await vscode.window.showQuickPick(
      environments.map((env) => ({
        label: env.name,
        description: env.name === current ? "current" : undefined,
        detail:
          env.folders.length > 0
            ? `Folders: ${env.folders.map((folder) => folder.name).join(", ")}`
            : undefined,
      })),
      { placeHolder: "Select the Relic environment used to run and debug code" },
    );
    if (!picked) return undefined;
    await this.setEnvironment(project, picked.label);
    return picked.label;
  }

  async ensureEnvironment(project: RelicProject): Promise<string | undefined> {
    if (!this.getEnvironment(project) && this.pendingHealthCheck) await this.pendingHealthCheck;
    return this.getEnvironment(project) ?? this.pickEnvironment(project);
  }

  async target(
    project: RelicProject,
    overrides: Partial<RunTarget> = {},
  ): Promise<RunTarget | undefined> {
    const environment = overrides.environment ?? (await this.ensureEnvironment(project));
    if (!environment) return undefined;
    return { environment, folder: overrides.folder, scope: overrides.scope };
  }

  async showProblem(err: unknown): Promise<void> {
    const health = this.recordError(err);
    switch (health.kind) {
      case "not_installed":
        await vscode.commands.executeCommand("relic.showSetup");
        return;
      case "not_logged_in": {
        const action = await vscode.window.showWarningMessage(
          "You're not logged in to Relic.",
          "Log In",
        );
        if (action) await vscode.commands.executeCommand("relic.login");
        return;
      }
      case "outdated": {
        const action = await vscode.window.showWarningMessage(health.message, "Upgrade CLI");
        if (action) {
          vscode.window
            .createTerminal({
              name: "Relic: upgrade",
              shellPath: this.cli.path,
              shellArgs: ["upgrade"],
            })
            .show();
        }
        return;
      }
      default:
        void vscode.window.showErrorMessage(
          `Relic: ${health.kind === "error" ? health.message : "unexpected error"}`,
        );
    }
  }

  dispose(): void {
    this.healthEmitter.dispose();
    this.environmentEmitter.dispose();
    this.namesEmitter.dispose();
  }
}
