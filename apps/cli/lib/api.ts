import { ensureValidJwt } from "@repo/auth";
import { api, type Id, type TableNames } from "@repo/backend";
import { trackError } from "@repo/logger";
import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://localhost:3210";
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL ?? "http://localhost:3211";

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
  scope: "client" | "server" | "shared";
}

export interface SecretData {
  id: string;
  key: string;
  encryptedValue: string;
  scope: "client" | "server" | "shared";
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

function createClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}

function toId<T extends TableNames>(id: string): Id<T> {
  return id as Id<T>;
}

export class ProtectedApi {
  private client: ConvexHttpClient;
  private authPromise: Promise<void> | null = null;

  constructor() {
    this.client = createClient();
  }

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

  async getCurrentUser(): Promise<User> {
    const result = await this.withAuth(() => this.client.query(api.user.getCurrentUser, {}));
    return {
      id: String(result.id),
      name: result.name,
      email: result.email,
      image: result.image ?? undefined,
      hasPro: result.hasPro ?? false,
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
    return result.shares.map(
      (share: {
        projectId: string;
        projectName: string;
        projectSlug: string;
        status: string;
        isRestricted: boolean;
        isArchived: boolean;
        ownerId?: string;
      }) => ({
        id: String(share.projectId),
        name: share.projectName,
        slug: share.projectSlug,
        status: share.status as ProjectListItem["status"],
        isRestricted: share.isRestricted,
        isArchived: share.isArchived,
        ownerId: share.ownerId,
        createdAt: 0,
        updatedAt: 0,
      }),
    );
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

  async getFullUser(): Promise<FullUser> {
    const result = await this.withAuth(() => this.client.query(api.user.getCurrentUser, {}));
    return {
      id: String(result.id),
      name: result.name,
      email: result.email,
      image: result.image ?? undefined,
      hasPro: result.hasPro ?? false,
      publicKey: result.publicKey ?? undefined,
      encryptedPrivateKey: result.encryptedPrivateKey ?? undefined,
      salt: result.salt ?? undefined,
      keysUpdatedAt: result.keysUpdatedAt ?? undefined,
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
        environmentId: environmentId ? toId<"environment">(environmentId) : undefined,
        folderId: folderId ? toId<"folder">(folderId) : undefined,
      }),
    );
  }

  async exportSecrets(args: {
    projectId: string;
    environmentName?: string;
    environmentId?: string;
    folderName?: string;
    folderId?: string;
    scope?: "client" | "server" | "shared";
  }): Promise<{
    secrets: SecretData[];
    count: number;
    encryptedProjectKey: string;
    environmentId: string;
    folderId: string | null;
  }> {
    const result: {
      secrets: SecretData[];
      count: number;
      encryptedProjectKey: string;
      environmentId: string;
      folderId: string | null;
    } = await this.withAuth(() =>
      this.client.mutation(api.secret.exportSecrets, {
        projectId: toId<"project">(args.projectId),
        environmentName: args.environmentName,
        environmentId: args.environmentId ? toId<"environment">(args.environmentId) : undefined,
        folderName: args.folderName,
        folderId: args.folderId ? toId<"folder">(args.folderId) : undefined,
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

export interface ExportSecretsHttpResponse {
  secrets: {
    id: string;
    key: string;
    encryptedValue: string;
    scope: "client" | "server" | "shared";
    valueType: "string" | "number" | "boolean";
  }[];
  count: number;
  encryptedProjectKey: string;
  environmentId: string;
  folderId: string | null;
}

export interface UserCryptoKeysResponse {
  encryptedPrivateKey: string;
  salt: string;
  publicKey: string;
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
  const url = `${CONVEX_SITE_URL}/api/secrets/export`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const parsed = errorBody as { error?: string; code?: string; upgradeUrl?: string } | null;

    if (response.status === 402 || parsed?.code === "PRO_PLAN_REQUIRED") {
      throw new ProPlanRequiredError(
        parsed?.error || "API keys require a Pro plan.",
        parsed?.upgradeUrl || "https://relic.so/dashboard?action=upgrade",
      );
    }

    throw new Error(parsed?.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as ExportSecretsHttpResponse;
}

export async function fetchUserKeysViaApiKey(apiKey: string): Promise<UserCryptoKeysResponse> {
  const url = `${CONVEX_SITE_URL}/api/user/keys`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const parsed = errorBody as { error?: string; code?: string; upgradeUrl?: string } | null;

    if (response.status === 402 || parsed?.code === "PRO_PLAN_REQUIRED") {
      throw new ProPlanRequiredError(
        parsed?.error || "API keys require a Pro plan.",
        parsed?.upgradeUrl || "https://relic.so/dashboard?action=upgrade",
      );
    }

    throw new Error(parsed?.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as UserCryptoKeysResponse;
}
