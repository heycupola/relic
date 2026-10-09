import * as vscode from "vscode";
import type { RelicService } from "./relic";

export class RelicStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    "relic.environment",
    vscode.StatusBarAlignment.Left,
    100,
  );
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly relic: RelicService) {
    this.item.name = "Relic Environment";
    this.disposables.push(
      this.item,
      relic.onDidChangeHealth(() => this.update()),
      relic.onDidChangeEnvironment(() => this.update()),
      relic.projects.onDidChange(() => this.update()),
      vscode.window.onDidChangeActiveTextEditor(() => this.update()),
    );
    this.update();
  }

  update(): void {
    const project = this.relic.projects.active();
    if (!project) {
      this.item.hide();
      return;
    }

    const health = this.relic.health;
    this.item.backgroundColor = undefined;

    switch (health.kind) {
      case "checking":
        this.item.text = "$(sync~spin) Relic";
        this.item.tooltip = "Checking the Relic CLI…";
        this.item.command = undefined;
        break;
      case "not_installed":
        this.item.text = "$(warning) Relic: install CLI";
        this.item.tooltip = "The relic CLI was not found. Click for setup help.";
        this.item.command = "relic.showSetup";
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        break;
      case "not_logged_in":
        this.item.text = "$(account) Relic: log in";
        this.item.tooltip = "You're not logged in to Relic. Click to run `relic login`.";
        this.item.command = "relic.login";
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        break;
      case "outdated":
        this.item.text = "$(warning) Relic: upgrade CLI";
        this.item.tooltip = health.message;
        this.item.command = "relic.showSetup";
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        break;
      default: {
        const environment = this.relic.getEnvironment(project);
        this.item.text = `$(lock) ${environment ?? "Relic: select environment"}`;
        const tooltip = new vscode.MarkdownString(
          environment
            ? `**Relic** environment for runs, tasks, debugging, and diagnostics: \`${environment}\`\n\nClick to change.`
            : "**Relic**: select the environment whose secrets are injected when you run code.",
        );
        this.item.tooltip = tooltip;
        this.item.command = "relic.selectEnvironment";
      }
    }

    this.item.show();
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
