import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getUserKeyCacheDb, hasPassword } from "@repo/auth";
import { z } from "zod";
import {
  prepareSecrets,
  prepareSecretsWithApiKey,
  prepareSecretsWithServiceToken,
  type RunOptions,
} from "../commands/run";
import { getCacheDb } from "../helpers/cache";
import { getApi } from "../lib/api";
import { getErrorMessage, hasActiveSession, resolveProjectIdWithConfig } from "../lib/cli";
import { findConfig } from "../lib/config";
import { loadProjectTree } from "../lib/projects";
import pkg from "../package.json";

const MAX_OUTPUT_CHARS = 50_000;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function json(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

function failure(action: string, err: unknown) {
  return text(`Failed to ${action}: ${getErrorMessage(err)}`);
}

async function requireAuth(): Promise<string | null> {
  if (!(await hasActiveSession())) {
    return "Not logged in. Run `relic login` first.";
  }
  return null;
}

const server = new McpServer({
  name: "relic",
  version: pkg.version,
});

server.registerTool(
  "whoami",
  {
    description: "Show the currently authenticated Relic user",
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => {
    const authError = await requireAuth();
    if (authError) return text(authError);

    try {
      const user = await getApi().getCurrentUser();
      return json({ name: user.name, email: user.email, plan: user.hasPro ? "Pro" : "Free" });
    } catch (err) {
      return failure("fetch user", err);
    }
  },
);

server.registerTool(
  "list-projects",
  {
    description: "List all Relic projects with their environments and folders",
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => {
    const authError = await requireAuth();
    if (authError) return text(authError);

    try {
      const projects = await loadProjectTree(getApi());
      return json(
        projects.map((project) => ({
          id: project.id,
          name: project.name,
          slug: project.slug,
          isShared: project.isShared,
          isArchived: project.isArchived,
          environments: project.environments.map((env) => ({
            id: env.id,
            name: env.name,
            folders: env.folders.map((f) => ({ id: f.id, name: f.name })),
          })),
        })),
      );
    } catch (err) {
      return failure("list projects", err);
    }
  },
);

server.registerTool(
  "list-secrets",
  {
    description:
      "List secret keys for a project environment. Returns names, scopes, and types only — never values.",
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: {
      projectId: z.string().describe("Project ID"),
      environment: z.string().describe("Environment name (e.g. production, staging)"),
      folder: z.string().optional().describe("Folder name"),
    },
  },
  async ({ projectId, environment, folder }) => {
    const authError = await requireAuth();
    if (authError) return text(authError);

    try {
      const api = getApi();
      const environments = await api.getProjectEnvironments(projectId);
      const env = environments.find((e) => e.name.toLowerCase() === environment.toLowerCase());

      if (!env) {
        const available = environments.map((e) => e.name).join(", ");
        return text(`Environment "${environment}" not found. Available: ${available || "none"}`);
      }

      const data = await api.getEnvironmentData(env.id);
      let secrets = data.secrets;

      if (folder) {
        const targetFolder = data.folders.find(
          (f) => f.name.toLowerCase() === folder.toLowerCase(),
        );
        if (!targetFolder) {
          const available = data.folders.map((f) => f.name).join(", ");
          return text(`Folder "${folder}" not found. Available: ${available || "none"}`);
        }
        secrets = secrets.filter((s) => s.folderId === targetFolder.id);
      }

      const folderMap = new Map(data.folders.map((f) => [f.id, f.name]));

      return json({
        environment: env.name,
        folder: folder ?? null,
        count: secrets.length,
        folders: data.folders.map((f) => f.name),
        secrets: secrets.map((s) => ({
          key: s.key,
          scope: s.scope,
          type: s.valueType,
          folder: s.folderId ? (folderMap.get(s.folderId) ?? null) : null,
        })),
      });
    } catch (err) {
      return failure("list secrets", err);
    }
  },
);

server.registerTool(
  "get-current-project",
  {
    description: "Get the project configuration from relic.toml in the current directory",
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async () => {
    try {
      const config = await findConfig();
      if (!config) {
        return text(
          "No relic.toml found in the current directory or any parent. Run `relic init` to initialize.",
        );
      }
      return json({
        projectId: config.config.project_id,
        configPath: config.configPath,
        rootDir: config.rootDir,
      });
    } catch (err) {
      return failure("read config", err);
    }
  },
);

server.registerTool(
  "run-with-secrets",
  {
    description:
      "Run a command with Relic secrets injected as environment variables. Secret values are never exposed — only command output is returned.",
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: {
      command: z.array(z.string()).describe('Command and arguments (e.g. ["npm", "run", "dev"])'),
      environment: z.string().describe("Environment name (e.g. production, staging)"),
      folder: z.string().optional().describe("Folder name"),
      scope: z.enum(["client", "server", "shared"]).optional().describe("Scope filter"),
      projectId: z
        .string()
        .optional()
        .describe("Project ID (defaults to relic.toml or RELIC_PROJECT_ID)"),
    },
  },
  async (args) => {
    try {
      const options: RunOptions = {
        environment: args.environment,
        folder: args.folder,
        scope: args.scope,
      };

      let secrets: Record<string, string>;

      if (process.env.RELIC_SERVICE_TOKEN) {
        const result = await prepareSecretsWithServiceToken(options);
        secrets = result.secrets;
      } else {
        const authError = await requireAuth();
        if (authError) return text(authError);

        if (!(await hasPassword())) {
          return text("No password set. Run 'relic' to set up your password first.");
        }

        const projectId = await resolveProjectIdWithConfig(args.projectId);
        if (!projectId) {
          return text(
            "No project ID provided and no relic.toml found. Use the projectId parameter or run `relic init`.",
          );
        }

        if (process.env.RELIC_API_KEY) {
          const result = await prepareSecretsWithApiKey(projectId, options);
          secrets = result.secrets;
        } else {
          const db = await getCacheDb();
          const userKeyDb = await getUserKeyCacheDb();
          const result = await prepareSecrets(projectId, options, db, userKeyDb, getApi());
          secrets = result.secrets;
        }
      }

      const proc = Bun.spawn(args.command, {
        env: { ...process.env, ...secrets },
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

      const truncate = (s: string) =>
        s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n... (truncated)` : s;

      return json({
        exitCode,
        stdout: truncate(stdout.trimEnd()),
        stderr: truncate(stderr.trimEnd()),
      });
    } catch (err) {
      return failure("run command", err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Relic MCP server v${pkg.version} started`);
