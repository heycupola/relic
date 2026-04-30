import { getPasswordFromStorage, SITE_URL, validateSession } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import { ConvexError } from "convex/values";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import { findConfig } from "../lib/config";

function resolveProjectId(projectId?: string): string | null {
  if (projectId) return projectId;
  if (process.env.RELIC_PROJECT_ID) return process.env.RELIC_PROJECT_ID;
  return null;
}

const UPGRADE_URL = `${SITE_URL}/dashboard?action=upgrade`;

function parseConvexError(err: unknown): { code?: string; message: string } {
  if (err instanceof ConvexError) {
    let data = err.data;
    while (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        break;
      }
    }
    if (typeof data === "object" && data !== null) {
      const d = data as { code?: string; message?: string };
      return { code: d.code, message: d.message ?? err.message };
    }
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

async function handleProUpgradePrompt(spinner: ReturnType<typeof ora>, message: string) {
  spinner.fail(pc.red(message));
  console.log();
  console.log(pc.dim("  Upgrade at: ") + pc.underline(UPGRADE_URL));
  console.log();

  if (process.stdin.isTTY) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(pc.dim("  Press Enter to open the upgrade page, or Ctrl+C to exit."));
    await new Promise<void>((resolve) =>
      rl.once("line", () => {
        rl.close();
        resolve();
      }),
    );
    const openModule = await import("open");
    await openModule.default(UPGRADE_URL);
  }

  process.exit(1);
}

async function handleError(spinner: ReturnType<typeof ora>, err: unknown) {
  const parsed = parseConvexError(err);
  if (parsed.code === "PRO_PLAN_REQUIRED") {
    await handleProUpgradePrompt(spinner, parsed.message);
  }
  spinner.fail(pc.red(parsed.message));
  process.exit(1);
}

function resolveOidcArgs(options: {
  github?: string;
  gitlab?: string;
  branch?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
  oidcAudience?: string;
}): { oidcIssuer?: string; oidcSubjectPattern?: string; oidcAudience?: string } {
  if (options.github && options.gitlab) {
    throw new Error("Cannot use both --github and --gitlab.");
  }

  if (options.github) {
    const parts = options.github.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("--github must be in the format org/repo (e.g. myorg/myrepo).");
    }
    const branch = options.branch ?? "*";
    const ref = branch === "*" ? "*" : `ref:refs/heads/${branch}`;
    return {
      oidcIssuer: "https://token.actions.githubusercontent.com",
      oidcSubjectPattern: `repo:${options.github}:${ref}`,
      oidcAudience: options.oidcAudience,
    };
  }

  if (options.gitlab) {
    const parts = options.gitlab.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("--gitlab must be in the format group/project (e.g. mygroup/myproject).");
    }
    const branch = options.branch ?? "*";
    const ref = branch === "*" ? "*" : `ref_type:branch:ref:${branch}`;
    return {
      oidcIssuer: "https://gitlab.com",
      oidcSubjectPattern: `project_path:${options.gitlab}:${ref}`,
      oidcAudience: options.oidcAudience,
    };
  }

  return {
    oidcIssuer: options.oidcIssuer,
    oidcSubjectPattern: options.oidcSubject,
    oidcAudience: options.oidcAudience,
  };
}

export async function serviceAccountCreate(options: {
  project?: string;
  name: string;
  expiresIn?: string;
  github?: string;
  gitlab?: string;
  branch?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
  oidcAudience?: string;
}) {
  const spinner = ora("Checking authentication...").start();

  try {
    const oidcArgs = resolveOidcArgs(options);

    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.fail(pc.red("Not logged in. Run 'relic login' first."));
      process.exit(1);
    }

    spinner.text = "Verifying password...";
    const password = await getPasswordFromStorage();
    if (!password) {
      spinner.fail(pc.red("No password set. Run 'relic' to set up your password first."));
      process.exit(1);
    }

    spinner.text = "Loading configuration...";
    let projectId = resolveProjectId(options.project);
    if (!projectId) {
      const configResult = await findConfig();
      if (configResult) {
        projectId = configResult.config.project_id;
      }
    }

    if (!projectId) {
      spinner.fail(pc.red("Project ID is required. Use --project <id> or set RELIC_PROJECT_ID."));
      process.exit(1);
    }

    spinner.text = "Fetching project details...";
    const api = getApi();
    const user = await api.getFullUser();

    if (!user.publicKey || !user.encryptedPrivateKey || !user.salt) {
      spinner.fail(pc.red("Encryption keys not set up. Run 'relic' to set up your keys."));
      process.exit(1);
    }

    const project = await api.getProject(projectId);

    spinner.text = "Generating service account keys...";
    const { createServiceAccountKeys, unwrapProjectKey, wrapAESKeyWithRSA, importPublicKey } =
      await import("@repo/crypto");
    const { generateServiceToken, extractServiceTokenPrefix, hashKey } =
      await import("@repo/backend/convex/lib/crypto");

    const rawToken = generateServiceToken();
    const hashedToken = await hashKey(rawToken);
    const tokenPrefix = extractServiceTokenPrefix(rawToken);

    const saKeys = await createServiceAccountKeys(rawToken);

    const projectKey = await unwrapProjectKey(
      project.encryptedProjectKey,
      user.encryptedPrivateKey,
      password,
      user.salt,
    );

    const saPublicKey = await importPublicKey(saKeys.publicKey);
    const encryptedProjectKey = await wrapAESKeyWithRSA(projectKey, saPublicKey);

    let expiresAt: number | undefined;
    if (options.expiresIn) {
      const days = Number.parseInt(options.expiresIn, 10);
      if (Number.isNaN(days) || days <= 0) {
        spinner.fail(pc.red("--expires-in must be a positive number of days."));
        process.exit(1);
      }
      expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    }

    spinner.text = "Creating service account...";
    await api.createServiceAccount({
      projectId,
      name: options.name,
      publicKey: saKeys.publicKey,
      encryptedPrivateKey: saKeys.encryptedPrivateKey,
      salt: saKeys.salt,
      encryptedProjectKey,
      hashedToken,
      tokenPrefix,
      expiresAt,
      oidcIssuer: oidcArgs.oidcIssuer,
      oidcSubjectPattern: oidcArgs.oidcSubjectPattern,
      oidcAudience: oidcArgs.oidcAudience,
    });

    spinner.succeed(pc.green("Service account created"));

    console.log();
    console.log(pc.bold("  Service Token (shown once):"));
    console.log();
    console.log(`  ${pc.cyan(rawToken)}`);
    console.log();
    console.log(pc.dim("  Store this token in your CI provider's secret storage."));
    console.log(pc.dim("  Set it as RELIC_SERVICE_TOKEN in your pipeline environment."));

    if (oidcArgs.oidcIssuer) {
      console.log();
      console.log(pc.dim("  OIDC trust policy:"));
      console.log(pc.dim(`    ${oidcArgs.oidcSubjectPattern}`));
      console.log(pc.dim("  OIDC token will be auto-detected in supported CI environments."));
    }
    console.log();

    trackEvent("service_account_created", { projectId, hasOidc: !!oidcArgs.oidcIssuer });
  } catch (err) {
    await handleError(spinner, err);
  }
}

export async function serviceAccountList(options: { project?: string }) {
  const spinner = ora("Checking authentication...").start();

  try {
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.fail(pc.red("Not logged in. Run 'relic login' first."));
      process.exit(1);
    }

    let projectId = resolveProjectId(options.project);
    if (!projectId) {
      const configResult = await findConfig();
      if (configResult) {
        projectId = configResult.config.project_id;
      }
    }

    if (!projectId) {
      spinner.fail(pc.red("Project ID is required. Use --project <id> or set RELIC_PROJECT_ID."));
      process.exit(1);
    }

    spinner.text = "Fetching service accounts...";
    const api = getApi();
    const accounts = await api.listServiceAccounts(projectId);

    spinner.stop();

    if (accounts.length === 0) {
      console.log(pc.dim("\n  No service accounts found for this project.\n"));
      return;
    }

    console.log();
    for (const sa of accounts) {
      const status = sa.revokedAt
        ? pc.red("revoked")
        : sa.expiresAt && sa.expiresAt < Date.now()
          ? pc.yellow("expired")
          : pc.green("active");

      const lastUsed = sa.lastUsedAt
        ? new Date(sa.lastUsedAt).toLocaleDateString()
        : pc.dim("never");
      const expires = sa.expiresAt ? new Date(sa.expiresAt).toLocaleDateString() : pc.dim("never");
      const oidc = sa.oidcIssuer ? pc.cyan("enabled") : pc.dim("off");

      console.log(`  ${pc.bold(sa.name)}`);
      console.log(`    Token:   ${pc.dim(`${sa.tokenPrefix}...`)}`);
      console.log(`    Status:  ${status}`);
      console.log(`    OIDC:    ${oidc}`);
      if (sa.oidcIssuer) {
        console.log(`    Issuer:  ${pc.dim(sa.oidcIssuer)}`);
        console.log(`    Subject: ${pc.dim(sa.oidcSubjectPattern ?? "")}`);
      }
      console.log(`    Expires: ${expires}`);
      console.log(`    Used:    ${lastUsed}`);
      console.log(`    Created: ${new Date(sa.createdAt).toLocaleDateString()}`);
      console.log();
    }
  } catch (err) {
    await handleError(spinner, err);
  }
}

export async function serviceAccountRevoke(options: { project?: string; name: string }) {
  const spinner = ora("Checking authentication...").start();

  try {
    const sessionValidation = await validateSession();
    if (!sessionValidation.isValid || sessionValidation.isExpired) {
      spinner.fail(pc.red("Not logged in. Run 'relic login' first."));
      process.exit(1);
    }

    let projectId = resolveProjectId(options.project);
    if (!projectId) {
      const configResult = await findConfig();
      if (configResult) {
        projectId = configResult.config.project_id;
      }
    }

    if (!projectId) {
      spinner.fail(pc.red("Project ID is required. Use --project <id> or set RELIC_PROJECT_ID."));
      process.exit(1);
    }

    spinner.text = "Fetching service accounts...";
    const api = getApi();
    const accounts = await api.listServiceAccounts(projectId);

    const target = accounts.find((sa) => sa.name === options.name);
    if (!target) {
      spinner.fail(pc.red(`Service account "${options.name}" not found.`));
      process.exit(1);
    }

    if (target.revokedAt) {
      spinner.fail(pc.red(`Service account "${options.name}" is already revoked.`));
      process.exit(1);
    }

    spinner.text = "Revoking service account...";
    await api.revokeServiceAccount(target.id);

    spinner.succeed(pc.green(`Service account "${options.name}" revoked`));

    trackEvent("service_account_revoked", { projectId });
  } catch (err) {
    await handleError(spinner, err);
  }
}
