import { ptr } from "bun:ffi";
import { getPasswordFromStorage, hasPassword, validateSession } from "@repo/auth";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
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

type RunStatus =
  | "checking_auth"
  | "checking_password"
  | "loading_config"
  | "loading_project"
  | "loading_environment"
  | "loading_secrets"
  | "decrypting"
  | "running"
  | "success"
  | "error";

interface RunState {
  status: RunStatus;
  error: string | null;
  project: Project | null;
  environment: Environment | null;
  folder: Folder | null;
  secretCount: number;
}

function RunFlow({ command, options }: { command: string[]; options: RunOptions }) {
  const [state, setState] = useState<RunState>({
    status: "checking_auth",
    error: null,
    project: null,
    environment: null,
    folder: null,
    secretCount: 0,
  });

  useEffect(() => {
    async function execute() {
      try {
        const sessionValidation = await validateSession();
        if (!sessionValidation.isValid || sessionValidation.isExpired) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "Not logged in. Run 'relic login' first.",
          }));
          return;
        }

        setState((prev) => ({ ...prev, status: "checking_password" }));
        const hasPass = await hasPassword();
        if (!hasPass) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "No password set. Run 'relic tui' to set up your password first.",
          }));
          return;
        }

        const password = await getPasswordFromStorage();
        if (!password) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "Could not retrieve password. Please re-authenticate.",
          }));
          return;
        }

        setState((prev) => ({ ...prev, status: "loading_config" }));
        const configResult = await findConfig();
        if (!configResult) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "No .relic/config.toml found. Run 'relic init' first.",
          }));
          return;
        }

        const api = getApi();

        setState((prev) => ({ ...prev, status: "loading_project" }));
        let project: Project;
        let user: FullUser;
        try {
          [project, user] = await Promise.all([
            api.getProject(configResult.config.project_id),
            api.getFullUser(),
          ]);
          setState((prev) => ({ ...prev, project }));
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Failed to load project: ${err instanceof Error ? err.message : err}`,
          }));
          return;
        }

        if (!user.encryptedPrivateKey || !user.salt) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "User keys not set up. Run 'relic tui' to complete setup.",
          }));
          return;
        }

        // Fetch environments and project share in parallel (both depend only on project.id)
        setState((prev) => ({ ...prev, status: "loading_environment" }));
        let environments: Environment[];
        let projectShare: { encryptedProjectKey: string } | null = null;
        try {
          [environments, projectShare] = await Promise.all([
            api.getProjectEnvironments(project.id),
            api.getProjectShare(project.id).catch(() => null),
          ]);
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Failed to load environments: ${err instanceof Error ? err.message : err}`,
          }));
          return;
        }

        const environment = environments.find(
          (e) => e.name.toLowerCase() === options.env.toLowerCase(),
        );
        if (!environment) {
          const available = environments.map((e) => e.name).join(", ");
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Environment "${options.env}" not found. Available: ${available || "none"}`,
          }));
          return;
        }
        setState((prev) => ({ ...prev, environment }));

        setState((prev) => ({ ...prev, status: "loading_secrets" }));
        let secrets: Secret[];
        let folders: Folder[];
        try {
          const envData = await api.getEnvironmentData(environment.id);
          secrets = envData.secrets;
          folders = envData.folders;
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Failed to load secrets: ${err instanceof Error ? err.message : err}`,
          }));
          return;
        }

        let folder: Folder | null = null;
        if (options.folder) {
          folder =
            folders.find((f) => f.name.toLowerCase() === options.folder?.toLowerCase()) || null;
          if (!folder) {
            const available = folders.map((f) => f.name).join(", ");
            setState((prev) => ({
              ...prev,
              status: "error",
              error: `Folder "${options.folder}" not found. Available: ${available || "none"}`,
            }));
            return;
          }
          secrets = secrets.filter((s) => s.folderId === folder?.id);
          setState((prev) => ({ ...prev, folder }));
        } else {
          // Only root-level secrets (no folder)
          secrets = secrets.filter((s) => !s.folderId);
        }

        // Filter by scope if specified
        if (options.scope) {
          const scopeFilter = options.scope.toLowerCase() as SecretScope;
          if (!["client", "server", "shared"].includes(scopeFilter)) {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: `Invalid scope "${options.scope}". Must be: client, server, or shared`,
            }));
            return;
          }

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

        setState((prev) => ({ ...prev, secretCount: secrets.length }));

        const scopeInfo = options.scope ? ` with scope "${options.scope}"` : "";
        if (secrets.length === 0) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `No secrets found in environment "${environment.name}"${folder ? ` folder "${folder.name}"` : ""}${scopeInfo}.`,
          }));
          return;
        }

        setState((prev) => ({ ...prev, status: "decrypting" }));

        // Use project share key if available, otherwise use project's own key
        const encryptedProjectKey =
          projectShare?.encryptedProjectKey ?? project.encryptedProjectKey;

        let projectKey: CryptoKey;
        try {
          projectKey = await getProjectKey(
            encryptedProjectKey,
            user.encryptedPrivateKey,
            user.salt,
          );
        } catch (err) {
          if (err instanceof ProjectKeyError) {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: err.message,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: `Failed to decrypt project key: ${err}`,
            }));
          }
          return;
        }

        let decryptedSecrets: Array<{ key: string; value: string }>;
        try {
          decryptedSecrets = await decryptSecrets(
            projectKey,
            secrets.map((s) => ({ key: s.key, encryptedValue: s.encryptedValue })),
          );
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Failed to decrypt secrets: ${err instanceof Error ? err.message : err}`,
          }));
          return;
        }

        const secretsObj: Record<string, string> = {};
        for (const secret of decryptedSecrets) {
          secretsObj[secret.key] = secret.value;
        }

        setState((prev) => ({ ...prev, status: "running" }));

        try {
          const runner = await RunnerBridge.getInstance();

          const commandJson = JSON.stringify(command);
          const secretsJson = JSON.stringify(secretsObj);

          const commandBuffer = Buffer.from(`${commandJson}\0`, "utf-8");
          const secretsBuffer = Buffer.from(`${secretsJson}\0`, "utf-8");

          const commandPtr = ptr(commandBuffer);
          const secretsPtr = ptr(secretsBuffer);

          const exitCode = runner.runWithSecrets(commandPtr, secretsPtr);

          if (exitCode === 0) {
            setState((prev) => ({ ...prev, status: "success" }));
          } else {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: `Command exited with code ${exitCode}`,
            }));
          }
          process.exit(exitCode);
        } catch (err) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: `Failed to run command: ${err instanceof Error ? err.message : err}`,
          }));
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    execute();
  }, [command, options]);

  useEffect(() => {
    if (state.status === "error") {
      setTimeout(() => process.exit(1), 100);
    }
  }, [state.status]);

  const statusMessages: Record<RunStatus, string> = {
    checking_auth: "Checking authentication...",
    checking_password: "Verifying password...",
    loading_config: "Loading configuration...",
    loading_project: "Loading project...",
    loading_environment: "Loading environment...",
    loading_secrets: "Loading secrets...",
    decrypting: "Decrypting secrets...",
    running: `Running with ${state.secretCount} secret${state.secretCount !== 1 ? "s" : ""}...`,
    success: "Done",
    error: "",
  };

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {state.status === "error" ? (
        <Text color="red">Error: {state.error}</Text>
      ) : state.status === "running" ? (
        <Box>
          <Text color="green">Injected {state.secretCount} secrets</Text>
        </Box>
      ) : (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {statusMessages[state.status]}</Text>
        </Box>
      )}
    </Box>
  );
}

export function run(command: string[], options: RunOptions) {
  if (!options.env) {
    console.error("Error: --env is required");
    process.exit(1);
  }

  if (command.length === 0) {
    console.error("Error: No command specified");
    process.exit(1);
  }

  if (options.scope && !["client", "server", "shared"].includes(options.scope.toLowerCase())) {
    console.error("Error: --scope must be: client, server, or shared");
    process.exit(1);
  }

  render(<RunFlow command={command} options={options} />);
}

export default run;
