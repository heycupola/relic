import { CONVEX_SITE_URL, CONVEX_URL, ensureValidJwt, SITE_URL } from "@repo/auth";
import { api, type Id, type TableNames } from "@repo/backend";
import { trackError } from "@repo/logger";
import { ConvexHttpClient } from "convex/browser";
import type { SecretScope } from "./types";

export const UPGRADE_URL = `${SITE_URL}/dashboard?action=upgrade`;

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  hasPro: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status: "owned" | "shared" | "archived" | "restricted";
  isRestricted: boolean;
  isArchived: boolean;
  ownerId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  name: string;
  projectId: string;
  color?: string;
}

export interface Folder {
  id: string;
  name: string;
  environmentId: string;
}

export interface Secret {
  id: string;
  key: string;
  encryptedValue: string;
  environmentId: string;
  folderId?: string;
  valueType: "string" | "number" | "boolean";
  scope: SecretScope;
}

export interface SecretData {
  id: string;
  key: string;
  encryptedValue: string;
  scope: SecretScope;
  valueType: "string" | "number" | "boolean";
}

export interface EnvironmentData {
  secrets: Secret[];
  folders: Folder[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  encryptedProjectKey: string;
  keyVersion: number;
  isArchived: boolean;
}

export interface FullUser extends User {
  publicKey?: string;
  encryptedPrivateKey?: string;
  salt?: string;
  keysUpdatedAt?: number;
}

export interface ServiceAccount {
  id: string;
  name: string;
  publicKey: string;
  tokenPrefix: string;
  oidcIssuer?: string;
  oidcSubjectPattern?: string;
  oidcAudience?: string;
  expiresAt?: number;
  revokedAt?: number;
  lastUsedAt?: number;
  createdAt: number;
}

export interface ExportSecretsResult {
  secrets: SecretData[];
  count: number;
  encryptedProjectKey: string;
  environmentId: string;
  folderId: string | null;
}

function toId<T extends TableNames>(id: string): Id<T> {
  return id as Id<T>;
}

function toOptionalId<T extends TableNames>(id: string | undefined): Id<T> | undefined {
  return id ? toId<T>(id) : undefined;
}

export class ProtectedApi {
  private client = new ConvexHttpClient(CONVEX_URL);
  private authPromise: Promise<void> | null = null;

  private async ensureAuth(): Promise<void> {
    if (this.authPromise) {
      await this.authPromise;
      return;
    }

    this.authPromise = (async () => {
      try {
        const token = await ensureValidJwt();
        this.client.setAuth(token);
      } catch (error) {
        trackError("cli", error, { action: "cli_auth" });
        this.client.clearAuth();
        throw error;
      } finally {
        this.authPromise = null;
      }
    })();

    await this.authPromise;
  }

  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    return fn();
  }

  private async fetchCurrentUser() {
    const result = await this.withAuth(() => this.client.query(api.user.getCurrentUser, {}));
    const user: User = {
      id: String(result.id),
      name: result.name,
      email: result.email,
      image: result.image ?? undefined,
      hasPro: result.hasPro ?? false,
    };
    return { result, user };
  }

  async getCurrentUser(): Promise<User> {
    const { user } = await this.fetchCurrentUser();
    return user;
  }

  async getFullUser(): Promise<FullUser> {
    const { result, user } = await this.fetchCurrentUser();
    return {
      ...user,
      publicKey: result.publicKey ?? undefined,
      encryptedPrivateKey: result.encryptedPrivateKey ?? undefined,
      salt: result.salt ?? undefined,
      keysUpdatedAt: result.keysUpdatedAt ?? undefined,
    };
  }

  async listProjects(): Promise<ProjectListItem[]> {
    const result = await this.withAuth(() => this.client.query(api.project.listUserProjects, {}));
    return result.projects.map((p) => ({
      ...p,
      id: String(p.id),
    })) as ProjectListItem[];
  }

  async listSharedProjects(): Promise<ProjectListItem[]> {
    const result = await this.withAuth(() =>
      this.client.query(api.projectShare.listActiveSharedProjectsForCurrentUser, {}),
    );
    return result.shares.map((share) => ({
      id: String(share.projectId),
      name: share.projectName,
      slug: share.projectSlug,
      status: share.status as ProjectListItem["status"],
      isRestricted: share.isRestricted,
      isArchived: share.isArchived,
      ownerId: share.ownerId,
      createdAt: 0,
      updatedAt: 0,
    }));
  }

  async getProjectEnvironments(projectId: string): Promise<Environment[]> {
    const result = await this.withAuth(() =>
      this.client.query(api.environment.getProjectEnvironments, {
        projectId: toId<"project">(projectId),
      }),
    );
    return result.map((e) => ({
      id: String(e.id),
      name: e.name,
      projectId: String(e.projectId),
      color: e.color,
    }));
  }

  async getEnvironmentData(environmentId: string): Promise<EnvironmentData> {
    const result = await this.withAuth(() =>
      this.client.query(api.environment.getEnvironmentData, {
        environmentId: toId<"environment">(environmentId),
      }),
    );
    return {
      secrets: result.secrets
        .filter((s) => !s.isDeleted)
        .map((s) => ({
          id: String(s.id),
          key: s.key,
          encryptedValue: s.encryptedValue,
          environmentId: String(s.environmentId),
          folderId: s.folderId ? String(s.folderId) : undefined,
          valueType: s.valueType,
          scope: s.scope,
        })),
      folders: result.folders.map((f) => ({
        id: String(f.id),
        name: f.name,
        environmentId: String(f.environmentId),
      })),
    };
  }

  async getProject(projectId: string): Promise<Project> {
    const result = await this.withAuth(() =>
      this.client.query(api.project.getProject, {
        projectId: toId<"project">(projectId),
      }),
    );
    return {
      id: String(result.id),
      name: result.name,
      slug: result.slug,
      encryptedProjectKey: result.encryptedProjectKey,
      keyVersion: result.keyVersion,
      isArchived: result.isArchived,
    };
  }

  async getProjectShare(projectId: string): Promise<{ encryptedProjectKey: string } | null> {
    const result = await this.withAuth(() =>
      this.client.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
        projectId: toId<"project">(projectId),
      }),
    );
    if (!result) return null;
    return { encryptedProjectKey: result.encryptedProjectKey };
  }

  async getSecretsForFolder(environmentId: string, folderId?: string): Promise<Secret[]> {
    const envData = await this.getEnvironmentData(environmentId);
    if (folderId) {
      return envData.secrets.filter((s) => s.folderId === folderId);
    }
    return envData.secrets.filter((s) => !s.folderId);
  }

  async getSecretsCacheValidation(
    projectId: string,
    environmentId?: string,
    folderId?: string,
  ): Promise<{ updatedAt: number } | null> {
    return await this.withAuth(() =>
      this.client.query(api.environment.getSecretsCacheValidation, {
        projectId: toId<"project">(projectId),
        environmentId: toOptionalId<"environment">(environmentId),
        folderId: toOptionalId<"folder">(folderId),
      }),
    );
  }

  async exportSecrets(args: {
    projectId: string;
    environmentName?: string;
    environmentId?: string;
    folderName?: string;
    folderId?: string;
    scope?: SecretScope;
  }): Promise<ExportSecretsResult> {
    const result = await this.withAuth(() =>
      this.client.mutation(api.secret.exportSecrets, {
        projectId: toId<"project">(args.projectId),
        environmentName: args.environmentName,
        environmentId: toOptionalId<"environment">(args.environmentId),
        folderName: args.folderName,
        folderId: toOptionalId<"folder">(args.folderId),
        scope: args.scope,
      }),
    );

    return {
      secrets: result.secrets,
      count: result.count,
      encryptedProjectKey: result.encryptedProjectKey,
      environmentId: String(result.environmentId),
      folderId: result.folderId ? String(result.folderId) : null,
    };
  }

  async createServiceAccount(args: {
    projectId: string;
    name: string;
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    encryptedProjectKey: string;
    hashedToken: string;
    tokenPrefix: string;
    expiresAt?: number;
    oidcIssuer?: string;
    oidcSubjectPattern?: string;
    oidcAudience?: string;
  }): Promise<{ id: string; tokenPrefix: string }> {
    const result = await this.withAuth(() =>
      this.client.mutation(api.serviceAccount.createServiceAccount, {
        ...args,
        projectId: toId<"project">(args.projectId),
      }),
    );
    return { id: String(result.id), tokenPrefix: result.tokenPrefix };
  }

  async updateOidcPolicy(args: {
    serviceAccountId: string;
    oidcIssuer?: string;
    oidcSubjectPattern?: string;
    oidcAudience?: string;
  }): Promise<{ success: boolean }> {
    return await this.withAuth(() =>
      this.client.mutation(api.serviceAccount.updateOidcPolicy, {
        ...args,
        serviceAccountId: toId<"serviceAccount">(args.serviceAccountId),
      }),
    );
  }

  async listServiceAccounts(projectId: string): Promise<ServiceAccount[]> {
    const result = await this.withAuth(() =>
      this.client.query(api.serviceAccount.listServiceAccounts, {
        projectId: toId<"project">(projectId),
      }),
    );
    return result.map((sa) => ({ ...sa, id: String(sa.id) }));
  }

  async revokeServiceAccount(serviceAccountId: string): Promise<{ success: boolean }> {
    return await this.withAuth(() =>
      this.client.mutation(api.serviceAccount.revokeServiceAccount, {
        serviceAccountId: toId<"serviceAccount">(serviceAccountId),
      }),
    );
  }
}

let instance: ProtectedApi | null = null;

export function getApi(): ProtectedApi {
  if (!instance) {
    instance = new ProtectedApi();
  }
  return instance;
}

export class ProPlanRequiredError extends Error {
  upgradeUrl: string;
  constructor(message: string, upgradeUrl: string) {
    super(message);
    this.name = "ProPlanRequiredError";
    this.upgradeUrl = upgradeUrl;
  }
}

export type ExportSecretsHttpResponse = ExportSecretsResult;

export interface UserCryptoKeysResponse {
  encryptedPrivateKey: string;
  salt: string;
  publicKey: string;
}

export interface ServiceAccountExportResponse extends ExportSecretsResult {
  encryptedPrivateKey: string;
  salt: string;
}

async function requestSiteApi<T>(
  path: string,
  options: {
    token: string;
    proPlanMessage: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      upgradeUrl?: string;
    } | null;

    if (response.status === 402 || parsed?.code === "PRO_PLAN_REQUIRED") {
      throw new ProPlanRequiredError(
        parsed?.error || options.proPlanMessage,
        parsed?.upgradeUrl || UPGRADE_URL,
      );
    }

    throw new Error(parsed?.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function exportSecretsViaApiKey(
  apiKey: string,
  body: {
    projectId: string;
    environmentName: string;
    folderName?: string;
    scope?: string;
  },
): Promise<ExportSecretsHttpResponse> {
  return requestSiteApi("/api/secrets/export", {
    token: apiKey,
    body,
    proPlanMessage: "API keys require a Pro plan.",
  });
}

export async function exportSecretsViaServiceToken(
  serviceToken: string,
  body: {
    environmentName?: string;
    folderName?: string;
    scope?: string;
  },
  oidcToken?: string,
): Promise<ServiceAccountExportResponse> {
  return requestSiteApi("/api/sa/secrets/export", {
    token: serviceToken,
    body,
    headers: oidcToken ? { "X-Oidc-Token": oidcToken } : undefined,
    proPlanMessage: "Service accounts require a Pro plan.",
  });
}

export async function fetchUserKeysViaApiKey(apiKey: string): Promise<UserCryptoKeysResponse> {
  return requestSiteApi("/api/user/keys", {
    token: apiKey,
    proPlanMessage: "API keys require a Pro plan.",
  });
}
