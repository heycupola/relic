import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
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

/** Serializes secrets in the NAME=VALUE format read by `fly secrets import` on stdin. */
export function formatFlyImport(secrets: Record<string, string>): string {
  return Object.entries(secrets)
    .map(([name, value]) => (value.includes("\n") ? `${name}="""${value}"""` : `${name}=${value}`))
    .join("\n");
}

export class FlyAdapter implements PlatformAdapter {
  readonly id = "fly" as const;
  readonly label = "Fly.io";
  readonly productionLike = true;
  readonly destination: string;

  constructor(
    private readonly deps: PushDeps,
    private readonly fly: string,
    private readonly app: string,
    private readonly stage: boolean,
  ) {
    this.destination = app;
  }

  validate(secrets: Record<string, string>): string[] {
    const problems: string[] = [];
    for (const [name, value] of Object.entries(secrets)) {
      if (!ENV_NAME_PATTERN.test(name)) {
        problems.push(
          `${name}: Fly secret names may only contain letters, digits, and underscores`,
        );
      }
      // `fly secrets import` treats quotes and surrounding whitespace specially, so these
      // values could be stored differently from what Relic holds.
      if (value.includes('"""') || /^["']|["']$/.test(value) || value !== value.trim()) {
        problems.push(
          `${name}: value has leading/trailing quotes or whitespace, which fly secrets import cannot round-trip`,
        );
      }
    }
    return problems;
  }

  private stageFlag(): string[] {
    return this.stage ? ["--stage"] : [];
  }

  async list(): Promise<RemoteSecret[]> {
    const result = await this.deps.exec(this.fly, ["secrets", "list", "-a", this.app, "--json"]);
    if (result.exitCode !== 0) {
      throw commandFailure("fly secrets list failed", result.stderr, result.stdout);
    }
    try {
      const secrets = parseJsonOutput<Array<{ Name?: string; name?: string }>>(result.stdout);
      return secrets
        .map((secret) => secret.Name ?? secret.name)
        .filter((name): name is string => !!name)
        .map((name) => ({ name }));
    } catch {
      throw new PushError("Could not parse `fly secrets list` output.");
    }
  }

  async upsert(secrets: Record<string, string>): Promise<void> {
    const result = await this.deps.exec(
      this.fly,
      ["secrets", "import", "-a", this.app, ...this.stageFlag()],
      { input: formatFlyImport(secrets) },
    );
    if (result.exitCode !== 0) {
      throw commandFailure("fly secrets import failed", result.stderr, result.stdout);
    }
  }

  async delete(names: string[]): Promise<void> {
    if (names.length === 0) return;
    const result = await this.deps.exec(this.fly, [
      "secrets",
      "unset",
      ...names,
      "-a",
      this.app,
      ...this.stageFlag(),
    ]);
    if (result.exitCode !== 0) {
      throw commandFailure("fly secrets unset failed", result.stderr, result.stdout);
    }
  }
}

export const flyAdapterFactory: AdapterFactory = {
  id: "fly",
  label: "Fly.io",
  aliases: ["fly", "flyio", "fly.io"],
  async create(options, deps) {
    let app = options.flyApp;
    if (!app) {
      const content = await deps.readFile(join(deps.cwd, "fly.toml"));
      if (content) {
        try {
          app = (parseToml(content) as { app?: string }).app;
        } catch {
          throw new PushUsageError("Could not parse fly.toml.");
        }
      }
    }
    if (!app) {
      throw new PushUsageError(
        "No Fly app found.",
        "Pass --fly-app <name>, or run from a directory with fly.toml.",
      );
    }

    const fly = await resolveBinary(deps, ["fly", "flyctl"]);
    if (!fly) {
      throw new PlatformAuthError(
        "flyctl is not installed.",
        "Install it from https://fly.io/docs/flyctl/install/, then run `fly auth login`.",
      );
    }

    const whoami = await deps.exec(fly, ["auth", "whoami"]);
    if (whoami.exitCode !== 0) {
      throw new PlatformAuthError(
        "flyctl is not logged in.",
        "Run `fly auth login`, or set FLY_API_TOKEN.",
      );
    }

    return new FlyAdapter(deps, fly, app, !!options.flyStage);
  },
};
