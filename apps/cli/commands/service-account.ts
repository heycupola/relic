import { getPasswordFromStorage, validateSession } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import ora from "ora";
import pc from "picocolors";
import { getApi } from "../lib/api";
import { findConfig } from "../lib/config";

function resolveProjectId(projectId?: string): string | null {
  if (projectId) return projectId;
  if (process.env.RELIC_PROJECT_ID) return process.env.RELIC_PROJECT_ID;
  return null;
}

export async function serviceAccountCreate(options: {
  project?: string;
  name: string;
  expiresIn?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
  oidcAudience?: string;
}) {
  const spinner = ora("Checking authentication...").start();

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

  if (options.oidcIssuer && !options.oidcSubject) {
    spinner.fail(pc.red("--oidc-subject is required when --oidc-issuer is specified."));
    process.exit(1);
  }

  if (!options.oidcIssuer && options.oidcSubject) {
    spinner.fail(pc.red("--oidc-issuer is required when --oidc-subject is specified."));
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
  const { generateServiceToken, extractServiceTokenPrefix, hashKey } = await import(
    "@repo/backend/convex/lib/crypto"
  );

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
    oidcIssuer: options.oidcIssuer,
    oidcSubjectPattern: options.oidcSubject,
    oidcAudience: options.oidcAudience,
  });

  spinner.succeed(pc.green("Service account created"));

  console.log();
  console.log(pc.bold("  Service Token (shown once):"));
  console.log();
  console.log(`  ${pc.cyan(rawToken)}`);
  console.log();
  console.log(pc.dim("  Store this token in your CI provider's secret storage."));
  console.log(pc.dim("  Set it as RELIC_SERVICE_TOKEN in your pipeline environment."));

  if (options.oidcIssuer) {
    console.log();
    console.log(pc.dim("  OIDC policy configured:"));
    console.log(pc.dim(`    Issuer:  ${options.oidcIssuer}`));
    console.log(pc.dim(`    Subject: ${options.oidcSubject}`));
    if (options.oidcAudience) {
      console.log(pc.dim(`    Audience: ${options.oidcAudience}`));
    }
    console.log(pc.dim("  The OIDC token will be auto-detected in supported CI environments."));
  }
  console.log();

  trackEvent("service_account_created", { projectId, hasOidc: !!options.oidcIssuer });
}

export async function serviceAccountList(options: { project?: string }) {
  const spinner = ora("Checking authentication...").start();

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

    const lastUsed = sa.lastUsedAt ? new Date(sa.lastUsedAt).toLocaleDateString() : pc.dim("never");
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
}

export async function serviceAccountRevoke(options: { project?: string; name: string }) {
  const spinner = ora("Checking authentication...").start();

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
}
