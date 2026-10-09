import { getPasswordFromStorage } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import ora, { type Ora } from "ora";
import pc from "picocolors";
import { getApi, type ServiceAccount, UPGRADE_URL } from "../lib/api";
import {
  failWithUpgradePrompt,
  hasActiveSession,
  NO_KEYS_MESSAGE,
  NO_PASSWORD_MESSAGE,
  NOT_LOGGED_IN_MESSAGE,
  PROJECT_ID_REQUIRED_MESSAGE,
  parseConvexError,
  resolveProjectIdWithConfig,
} from "../lib/cli";
import { exitWithTelemetry } from "../lib/telemetry";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPIRES_IN_DAYS = 365;

interface OidcOptions {
  github?: string;
  gitlab?: string;
  branch?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
  oidcAudience?: string;
}

export interface ServiceAccountCreateOptions extends OidcOptions {
  project?: string;
  name: string;
  expiresIn?: string;
}

interface OidcArgs {
  oidcIssuer?: string;
  oidcSubjectPattern?: string;
  oidcAudience?: string;
}

async function handleError(spinner: Ora, err: unknown): Promise<never> {
  const parsed = parseConvexError(err);
  if (parsed.code === "PRO_PLAN_REQUIRED") {
    await failWithUpgradePrompt(spinner, parsed.message, UPGRADE_URL);
  }
  spinner.fail(pc.red(parsed.message));
  return exitWithTelemetry(1);
}

async function requireSession(): Promise<void> {
  if (!(await hasActiveSession())) {
    throw new Error(NOT_LOGGED_IN_MESSAGE);
  }
}

async function requireProjectId(projectOption?: string): Promise<string> {
  const projectId = await resolveProjectIdWithConfig(projectOption);
  if (!projectId) {
    throw new Error(PROJECT_ID_REQUIRED_MESSAGE);
  }
  return projectId;
}

const PATH_SEGMENT = /^[A-Za-z0-9_.-]+$/;

function isValidPath(value: string, minSegments: number, maxSegments: number): boolean {
  const parts = value.split("/");
  return (
    parts.length >= minSegments &&
    parts.length <= maxSegments &&
    parts.every((part) => PATH_SEGMENT.test(part))
  );
}

export function resolveOidcArgs(options: OidcOptions): OidcArgs {
  if (options.github && options.gitlab) {
    throw new Error("Cannot use both `--github` and `--gitlab`.");
  }

  if (options.branch !== undefined && !options.github && !options.gitlab) {
    throw new Error("`--branch` requires `--github` or `--gitlab`.");
  }

  if (options.github) {
    if (!isValidPath(options.github, 2, 2)) {
      throw new Error("`--github` must be in the format `org/repo` (e.g. `myorg/myrepo`).");
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
    // GitLab project paths may include nested subgroups: group/subgroup/.../project.
    if (!isValidPath(options.gitlab, 2, 21)) {
      throw new Error(
        "`--gitlab` must be in the format `group/project` or `group/subgroup/project`.",
      );
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

export function resolveExpiresAt(expiresIn?: string, now = Date.now()): number | undefined {
  if (expiresIn === undefined) return undefined;
  const trimmed = expiresIn.trim();
  const days = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRES_IN_DAYS) {
    throw new Error(
      `\`--expires-in\` must be a whole number of days between 1 and ${MAX_EXPIRES_IN_DAYS}.`,
    );
  }
  return now + days * DAY_MS;
}

export interface ServiceAccountRevokeOptions {
  project?: string;
  name?: string;
  id?: string;
}

/** Picks the account to revoke by id or name, preferring active ones and refusing to guess. */
export function selectServiceAccountToRevoke(
  accounts: ServiceAccount[],
  options: Pick<ServiceAccountRevokeOptions, "name" | "id">,
): ServiceAccount {
  if (options.id) {
    const byId = accounts.find((sa) => sa.id === options.id);
    if (!byId) throw new Error(`Service account with id \`${options.id}\` not found.`);
    if (byId.revokedAt) throw new Error(`Service account \`${byId.name}\` is already revoked.`);
    return byId;
  }

  const name = options.name;
  if (!name) {
    throw new Error("Specify the service account with `--name <name>` or `--id <id>`.");
  }

  const matches = accounts.filter((sa) => sa.name === name);
  if (matches.length === 0) {
    throw new Error(`Service account \`${name}\` not found.`);
  }

  const active = matches.filter((sa) => !sa.revokedAt);
  if (active.length === 0) {
    throw new Error(`Service account \`${name}\` is already revoked.`);
  }
  if (active.length > 1) {
    const ids = active.map((sa) => `${sa.id} (${sa.tokenPrefix}...)`).join(", ");
    throw new Error(
      `Multiple active service accounts are named \`${name}\`: ${ids}. Use \`--id <id>\` to choose one.`,
    );
  }
  return active[0]!;
}

function printOidcInstructions(options: OidcOptions, oidcArgs: OidcArgs): void {
  console.log();
  console.log(pc.dim("  OIDC trust policy:"));
  console.log(pc.dim(`    ${oidcArgs.oidcSubjectPattern}`));

  if (options.github) {
    console.log(
      pc.dim(
        "  GitHub Actions: the OIDC token is requested automatically. Add `permissions: id-token: write` to your workflow.",
      ),
    );
    if (oidcArgs.oidcAudience && oidcArgs.oidcAudience !== "relic") {
      console.log(
        pc.yellow(
          `  The CLI requests GitHub tokens with audience \`relic\`. With audience \`${oidcArgs.oidcAudience}\`, fetch the token yourself and set \`RELIC_OIDC_TOKEN\`.`,
        ),
      );
    }
  } else if (options.gitlab) {
    const audience = oidcArgs.oidcAudience ?? "relic";
    console.log(pc.dim("  GitLab CI: add an ID token named RELIC_OIDC_TOKEN to your job:"));
    console.log(pc.dim("    id_tokens:"));
    console.log(pc.dim("      RELIC_OIDC_TOKEN:"));
    console.log(pc.dim(`        aud: ${audience}`));
  } else {
    console.log(pc.dim("  Set `RELIC_OIDC_TOKEN` to your CI provider's OIDC token at runtime."));
  }
}

export async function serviceAccountCreate(options: ServiceAccountCreateOptions) {
  const spinner = ora("Checking authentication...").start();

  try {
    const oidcArgs = resolveOidcArgs(options);
    const expiresAt = resolveExpiresAt(options.expiresIn);

    await requireSession();

    spinner.text = "Verifying password...";
    const password = await getPasswordFromStorage();
    if (!password) {
      throw new Error(NO_PASSWORD_MESSAGE);
    }

    spinner.text = "Loading configuration...";
    const projectId = await requireProjectId(options.project);

    spinner.text = "Fetching project details...";
    const api = getApi();
    const user = await api.getFullUser();

    if (!user.publicKey || !user.encryptedPrivateKey || !user.salt) {
      throw new Error(NO_KEYS_MESSAGE);
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
      ...oidcArgs,
    });

    spinner.succeed(pc.green("Service account created"));

    console.log();
    console.log(pc.bold("  Service Token (shown once):"));
    console.log();
    console.log(`  ${pc.cyan(rawToken)}`);
    console.log();
    console.log(pc.dim("  Store this token in your CI provider's secret storage."));
    console.log(pc.dim("  Set it as `RELIC_SERVICE_TOKEN` in your pipeline environment."));

    if (oidcArgs.oidcIssuer) {
      printOidcInstructions(options, oidcArgs);
    }
    console.log();

    trackEvent("service_account_created", { hasOidc: !!oidcArgs.oidcIssuer });
  } catch (err) {
    await handleError(spinner, err);
  }
}

function formatDate(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleDateString() : pc.dim("never");
}

export async function serviceAccountList(options: { project?: string }) {
  const spinner = ora("Checking authentication...").start();

  try {
    await requireSession();
    const projectId = await requireProjectId(options.project);

    spinner.text = "Fetching service accounts...";
    const accounts = await getApi().listServiceAccounts(projectId);

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
      const oidc = sa.oidcIssuer ? pc.cyan("enabled") : pc.dim("off");

      console.log(`  ${pc.bold(sa.name)}`);
      console.log(`    ID:      ${pc.dim(sa.id)}`);
      console.log(`    Token:   ${pc.dim(`${sa.tokenPrefix}...`)}`);
      console.log(`    Status:  ${status}`);
      console.log(`    OIDC:    ${oidc}`);
      if (sa.oidcIssuer) {
        console.log(`    Issuer:  ${pc.dim(sa.oidcIssuer)}`);
        console.log(`    Subject: ${pc.dim(sa.oidcSubjectPattern ?? "")}`);
      }
      console.log(`    Expires: ${formatDate(sa.expiresAt)}`);
      console.log(`    Used:    ${formatDate(sa.lastUsedAt)}`);
      console.log(`    Created: ${new Date(sa.createdAt).toLocaleDateString()}`);
      console.log();
    }
  } catch (err) {
    await handleError(spinner, err);
  }
}

export async function serviceAccountRevoke(options: ServiceAccountRevokeOptions) {
  const spinner = ora("Checking authentication...").start();

  try {
    await requireSession();
    const projectId = await requireProjectId(options.project);

    spinner.text = "Fetching service accounts...";
    const api = getApi();
    const accounts = await api.listServiceAccounts(projectId);
    const target = selectServiceAccountToRevoke(accounts, options);

    spinner.text = "Revoking service account...";
    await api.revokeServiceAccount(target.id);

    spinner.succeed(pc.green(`Service account \`${target.name}\` revoked`));

    trackEvent("service_account_revoked", {});
  } catch (err) {
    await handleError(spinner, err);
  }
}
