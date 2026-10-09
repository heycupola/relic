import * as vscode from "vscode";
import { findEnvReferences, scanLanguageFor } from "./core/scanner";
import type { RelicService } from "./relic";

export const DIAGNOSTIC_SOURCE = "relic";
export const MISSING_SECRET_CODE = "missing-secret";

const SEVERITIES: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

export class SecretDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly relic: RelicService) {
    this.disposables.push(
      this.collection,
      vscode.workspace.onDidOpenTextDocument((doc) => this.schedule(doc, 0)),
      vscode.workspace.onDidChangeTextDocument((event) => this.schedule(event.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.collection.delete(doc.uri)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("relic.diagnostics")) this.refreshAll();
      }),
      relic.onDidChangeEnvironment(() => this.refreshAll()),
      relic.onDidChangeSecretNames(() => this.refreshAll()),
      relic.onDidChangeHealth((health) => {
        if (health.kind === "ready") this.refreshAll();
      }),
      relic.projects.onDidChange(() => this.refreshAll()),
    );
  }

  refreshAll(): void {
    for (const doc of vscode.workspace.textDocuments) this.schedule(doc, 0);
  }

  private schedule(document: vscode.TextDocument, delay = 400): void {
    if (!scanLanguageFor(document.languageId) || document.uri.scheme !== "file") return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.update(document);
      }, delay),
    );
  }

  private async update(document: vscode.TextDocument): Promise<void> {
    const config = vscode.workspace.getConfiguration("relic.diagnostics", document.uri);
    const language = scanLanguageFor(document.languageId);
    const project = this.relic.projects.forUri(document.uri);
    const environment = project ? this.relic.getEnvironment(project) : undefined;

    if (!config.get<boolean>("enabled", true) || !language || !project || !environment) {
      this.collection.delete(document.uri);
      return;
    }

    const version = document.version;
    const references = findEnvReferences(document.getText(), language);
    if (references.length === 0) {
      this.collection.delete(document.uri);
      return;
    }

    let names: Set<string>;
    try {
      names = await this.relic.secretNames(project, environment);
    } catch (err) {
      this.relic.recordError(err);
      this.collection.delete(document.uri);
      return;
    }
    if (document.isClosed || document.version !== version) return;

    const ignored = new Set(config.get<string[]>("ignore", []));
    const severity = SEVERITIES[config.get<string>("severity", "warning")] ?? SEVERITIES.warning!;

    const diagnostics = references
      .filter((ref) => !names.has(ref.name) && !ignored.has(ref.name))
      .map((ref) => {
        const range = new vscode.Range(
          document.positionAt(ref.start),
          document.positionAt(ref.end),
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          `"${ref.name}" is not a secret in the Relic "${environment}" environment.`,
          severity,
        );
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = MISSING_SECRET_CODE;
        return diagnostic;
      });

    this.collection.set(document.uri, diagnostics);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const disposable of this.disposables) disposable.dispose();
  }
}

export class MissingSecretActions implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  constructor(private readonly relic: RelicService) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const project = this.relic.projects.forUri(document.uri);
    const environment = project ? this.relic.getEnvironment(project) : undefined;
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code !== MISSING_SECRET_CODE) {
        continue;
      }
      const name = document.getText(diagnostic.range);

      const openTui = new vscode.CodeAction(
        `Add "${name}" in the Relic TUI`,
        vscode.CodeActionKind.QuickFix,
      );
      openTui.diagnostics = [diagnostic];
      openTui.isPreferred = true;
      openTui.command = { command: "relic.openTui", title: "Open Relic TUI" };

      const copy = new vscode.CodeAction(
        `Copy "${name}" and how to add it`,
        vscode.CodeActionKind.QuickFix,
      );
      copy.diagnostics = [diagnostic];
      copy.command = {
        command: "relic.copySecretGuidance",
        title: "Copy secret name",
        arguments: [name, environment],
      };

      const ignore = new vscode.CodeAction(
        `Ignore "${name}" in this workspace`,
        vscode.CodeActionKind.QuickFix,
      );
      ignore.diagnostics = [diagnostic];
      ignore.command = {
        command: "relic.ignoreVariable",
        title: "Ignore variable",
        arguments: [name, document.uri],
      };

      actions.push(openTui, copy, ignore);
    }
    return actions;
  }
}

export async function copySecretGuidance(name: string, environment?: string): Promise<void> {
  await vscode.env.clipboard.writeText(name);
  const where = environment ? `the "${environment}" environment` : "your environment";
  const action = await vscode.window.showInformationMessage(
    `Copied "${name}". Run \`relic\` to open the TUI, go to ${where}, and add it as a secret. Diagnostics refresh when the TUI closes.`,
    "Open Relic TUI",
  );
  if (action) await vscode.commands.executeCommand("relic.openTui");
}

export async function ignoreVariable(name: string, uri?: vscode.Uri): Promise<void> {
  const config = vscode.workspace.getConfiguration("relic.diagnostics", uri);
  const current = config.get<string[]>("ignore", []);
  if (current.includes(name)) return;
  await config.update("ignore", [...current, name], vscode.ConfigurationTarget.Workspace);
}
