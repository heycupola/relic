import { ptr } from "bun:ffi";
import { getPasswordFromStorage, hasPassword, validateSession } from "@repo/auth";
import ora from "ora";
import pc from "picocolors";
import { RunnerBridge } from "../ffi/bridge";
import {
  type Environment,
  type Folder,
  type FullUser,
  getApi,
  type Project,
  type Secret,
} from "../lib/api";
import { findConfig } from "../lib/config";
import { decryptSecrets, getProjectKey, ProjectKeyError } from "../lib/crypto";

type SecretScope = "client" | "server" | "shared";

interface RunOptions {
  env: string;
  folder?: string;
  scope?: string;
}

export default async function run(command: string[], options: RunOptions) {
  if (!options.env) {
    console.error(pc.red("Error: --env is required"));
    process.exit(1);
  }

  if (command.length === 0) {
    console.error(pc.red("Error: No command specified"));
    process.exit(1);
  }

  if (options.scope && !["client", "server", "shared"].includes(options.scope.toLowerCase())) {
    console.error(pc.red("Error: --scope must be: client, server, or shared"));
    process.exit(1);
  }

  const spinner = ora("Checking authentication...").start();

  try {
    // Check authentication
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.fail(pc.red("Not logged in. Run 'relic login' first."));
      process.exit(1);
    }

    // Check password
    spinner.text = "Verifying password...";
    const hasPass = await hasPassword();
    if (!hasPass) {
      spinner.fail(pc.red("No password set. Run 'relic tui' to set up your password first."));
      process.exit(1);
    }

    const password = await getPasswordFromStorage();
    if (!password) {
      spinner.fail(pc.red("Could not retrieve password. Please re-authenticate."));
      process.exit(1);
    }

    // Load config
    spinner.text = "Loading configuration...";
    const configResult = await findConfig();
    if (!configResult) {
      spinner.fail(pc.red("No .relic/config.toml found. Run 'relic init' first."));
      process.exit(1);
    }

    const api = getApi();

    // Load project and user
    spinner.text = "Loading project...";
    let project: Project;
    let user: FullUser;
    try {
      [project, user] = await Promise.all([
        api.getProject(configResult.config.project_id),
        api.getFullUser(),
      ]);
    } catch (err) {
      spinner.fail(pc.red(`Failed to load project: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }

    if (!user.encryptedPrivateKey || !user.salt) {
      spinner.fail(pc.red("User keys not set up. Run 'relic tui' to complete setup."));
      process.exit(1);
    }

    // Load environments and project share
    spinner.text = "Loading environment...";
    let environments: Environment[];
    let projectShare: { encryptedProjectKey: string } | null = null;
    try {
      [environments, projectShare] = await Promise.all([
        api.getProjectEnvironments(project.id),
        api.getProjectShare(project.id).catch(() => null),
      ]);
    } catch (err) {
      spinner.fail(
        pc.red(`Failed to load environments: ${err instanceof Error ? err.message : err}`),
      );
      process.exit(1);
    }

    const environment = environments.find(
      (e) => e.name.toLowerCase() === options.env.toLowerCase(),
    );
    if (!environment) {
      const available = environments.map((e) => e.name).join(", ");
      spinner.fail(
        pc.red(`Environment "${options.env}" not found. Available: ${available || "none"}`),
      );
      process.exit(1);
    }

    // Load secrets
    spinner.text = "Loading secrets...";
    let secrets: Secret[];
    let folders: Folder[];
    try {
      const envData = await api.getEnvironmentData(environment.id);
      secrets = envData.secrets;
      folders = envData.folders;
    } catch (err) {
      spinner.fail(pc.red(`Failed to load secrets: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }

    // Filter by folder
    let folder: Folder | null = null;
    if (options.folder) {
      folder = folders.find((f) => f.name.toLowerCase() === options.folder?.toLowerCase()) || null;
      if (!folder) {
        const available = folders.map((f) => f.name).join(", ");
        spinner.fail(
          pc.red(`Folder "${options.folder}" not found. Available: ${available || "none"}`),
        );
        process.exit(1);
      }
      secrets = secrets.filter((s) => s.folderId === folder?.id);
    } else {
      // Only root-level secrets (no folder)
      secrets = secrets.filter((s) => !s.folderId);
    }

    // Filter by scope
    if (options.scope) {
      const scopeFilter = options.scope.toLowerCase() as SecretScope;

      // Inclusive filtering: client/server also includes shared secrets
      if (scopeFilter === "client") {
        secrets = secrets.filter((s) => s.scope === "client" || s.scope === "shared");
      } else if (scopeFilter === "server") {
        secrets = secrets.filter((s) => s.scope === "server" || s.scope === "shared");
      } else {
        // "shared" - exact match only
        secrets = secrets.filter((s) => s.scope === "shared");
      }
    }

    const scopeInfo = options.scope ? ` with scope "${options.scope}"` : "";
    if (secrets.length === 0) {
      spinner.fail(
        pc.red(
          `No secrets found in environment "${environment.name}"${folder ? ` folder "${folder.name}"` : ""}${scopeInfo}.`,
        ),
      );
      process.exit(1);
    }

    // Decrypt secrets
    spinner.text = "Decrypting secrets...";

    // Use project share key if available, otherwise use project's own key
    const encryptedProjectKey = projectShare?.encryptedProjectKey ?? project.encryptedProjectKey;

    let projectKey: CryptoKey;
    try {
      projectKey = await getProjectKey(encryptedProjectKey, user.encryptedPrivateKey, user.salt);
    } catch (err) {
      if (err instanceof ProjectKeyError) {
        spinner.fail(pc.red(err.message));
      } else {
        spinner.fail(pc.red(`Failed to decrypt project key: ${err}`));
      }
      process.exit(1);
    }

    let decryptedSecrets: Array<{ key: string; value: string }>;
    try {
      decryptedSecrets = await decryptSecrets(
        projectKey,
        secrets.map((s) => ({ key: s.key, encryptedValue: s.encryptedValue })),
      );
    } catch (err) {
      spinner.fail(
        pc.red(`Failed to decrypt secrets: ${err instanceof Error ? err.message : err}`),
      );
      process.exit(1);
    }

    const secretsObj: Record<string, string> = {};
    for (const secret of decryptedSecrets) {
      secretsObj[secret.key] = secret.value;
    }

    // Run command
    spinner.succeed(
      pc.green(`Injected ${secrets.length} secret${secrets.length !== 1 ? "s" : ""}`),
    );

    try {
      const runner = await RunnerBridge.getInstance();

      const commandJson = JSON.stringify(command);
      const secretsJson = JSON.stringify(secretsObj);

      const commandBuffer = Buffer.from(`${commandJson}\0`, "utf-8");
      const secretsBuffer = Buffer.from(`${secretsJson}\0`, "utf-8");

      const commandPtr = ptr(commandBuffer);
      const secretsPtr = ptr(secretsBuffer);

      const exitCode = runner.runWithSecrets(commandPtr, secretsPtr);
      process.exit(exitCode);
    } catch (err) {
      console.error(pc.red(`Failed to run command: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  } catch (err) {
    spinner.fail(pc.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
