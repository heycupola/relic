import { isProductionLikeName } from "./plan";
import {
  type AdapterFactory,
  PlatformAuthError,
  type PlatformAdapter,
  PushError,
  type PushDeps,
  PushUsageError,
  type RemoteSecret,
} from "./types";
import { commandFailure, ENV_NAME_PATTERN, parseJsonOutput, resolveBinary } from "./util";

const MAX_SECRET_BYTES = 48 * 1024;

export class GitHubActionsAdapter implements PlatformAdapter {
  readonly id = "github" as const;
  readonly label = "GitHub Actions";
  readonly destination: string;
  readonly productionLike: boolean;

  constructor(
    private readonly deps: PushDeps,
    private readonly gh: string,
    private readonly repo: string,
    private readonly environment: string | undefined,
  ) {
    this.destination = environment ? `${repo} (environment: ${environment})` : repo;
    this.productionLike = !environment || isProductionLikeName(environment);
  }

  private flags(): string[] {
    const flags = ["--repo", this.repo];
    if (this.environment) flags.push("--env", this.environment);
    return flags;
  }

  validate(secrets: Record<string, string>): string[] {
    const problems: string[] = [];
    for (const [name, value] of Object.entries(secrets)) {
      if (!ENV_NAME_PATTERN.test(name)) {
        problems.push(
          `${name}: GitHub secret names may only contain letters, digits, and underscores`,
        );
      } else if (/^GITHUB_/i.test(name)) {
        problems.push(`${name}: GitHub secret names cannot start with GITHUB_`);
      }
      if (value.length === 0) {
        problems.push(`${name}: GitHub does not accept empty secret values`);
      } else if (Buffer.byteLength(value, "utf-8") > MAX_SECRET_BYTES) {
        problems.push(`${name}: value exceeds GitHub's 48 KB secret limit`);
      }
    }
    return problems;
  }

  async list(): Promise<RemoteSecret[]> {
    const result = await this.deps.exec(this.gh, [
      "secret",
      "list",
      "--json",
      "name",
      ...this.flags(),
    ]);
    if (result.exitCode !== 0) {
      throw commandFailure("gh secret list failed", result.stderr, result.stdout);
    }
    try {
      const secrets = parseJsonOutput<Array<{ name: string }>>(result.stdout);
      return secrets.map((secret) => ({ name: secret.name }));
    } catch {
      throw new PushError("Could not parse `gh secret list` output.");
    }
  }

  async upsert(secrets: Record<string, string>): Promise<void> {
    const failed: string[] = [];
    for (const [name, value] of Object.entries(secrets)) {
      const result = await this.deps.exec(this.gh, ["secret", "set", name, ...this.flags()], {
        input: value,
      });
      if (result.exitCode !== 0) failed.push(name);
    }
    if (failed.length > 0) {
      throw new PushError(`gh failed to set: ${failed.join(", ")}`);
    }
  }

  async delete(names: string[]): Promise<void> {
    const failed: string[] = [];
    for (const name of names) {
      const result = await this.deps.exec(this.gh, ["secret", "delete", name, ...this.flags()]);
      if (result.exitCode !== 0) failed.push(name);
    }
    if (failed.length > 0) {
      throw new PushError(`gh failed to delete: ${failed.join(", ")}`);
    }
  }
}

export const githubAdapterFactory: AdapterFactory = {
  id: "github",
  label: "GitHub Actions",
  aliases: ["github", "gh", "github-actions"],
  async create(options, deps) {
    const gh = await resolveBinary(deps, ["gh"]);
    if (!gh) {
      throw new PlatformAuthError(
        "The GitHub CLI (gh) is not installed.",
        "Install it from https://cli.github.com, then run `gh auth login`.",
      );
    }

    const status = await deps.exec(gh, ["auth", "status"]);
    if (status.exitCode !== 0) {
      throw new PlatformAuthError(
        "The GitHub CLI is not logged in.",
        "Run `gh auth login`, or set GH_TOKEN.",
      );
    }

    let repo = options.githubRepo;
    if (!repo) {
      const view = await deps.exec(
        gh,
        ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
        { cwd: deps.cwd },
      );
      repo = view.exitCode === 0 ? view.stdout.trim() : undefined;
    }
    if (!repo) {
      throw new PushUsageError(
        "Could not determine the GitHub repository.",
        "Pass --github-repo <owner/repo>, or run inside a clone of the repository.",
      );
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new PushUsageError(`Invalid --github-repo: ${repo}`, "Use the owner/repo format.");
    }

    return new GitHubActionsAdapter(deps, gh, repo, options.githubEnv);
  },
};
