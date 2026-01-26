import { ensureValidJwt } from "@repo/auth";
import {
  api,
  SecretValueType as BackendSecretValueType,
  type Id,
  type TableNames,
} from "@repo/backend";
import { ConvexHttpClient } from "convex/browser";
import type {
  ActionLog,
  ApiSharedProjectResponse,
  ApiShareResponse,
  CreateProjectResult,
  Environment,
  EnvironmentData,
  Project,
  ProjectLimits,
  ProjectListItem,
  Secret,
  SecretScope,
  SecretValueType,
  SharedUser,
  ShareLimits,
  ShareProjectResult,
  User,
} from "./types/api";
import { logger } from "./utils/debugLog";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://localhost:3210";

function createClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}

/**
 * Type-safe helper to cast string IDs to Convex Id type.
 * Convex Id<T> is a branded string type (string & { __tableName: T }).
 * This cast is safe because we're passing IDs that came from Convex originally.
 */
function toId<T extends TableNames>(id: string): Id<T> {
  return id as Id<T>;
}

export class ProtectedApi {
  private client: ConvexHttpClient;
  private authPromise: Promise<void> | null = null;

  constructor() {
    this.client = createClient();
  }

  async ensureAuth(): Promise<void> {
    if (this.authPromise) {
      await this.authPromise;
      return;
    }

    this.authPromise = (async () => {
      try {
        const token = await ensureValidJwt();
        const tokenParts = token.split(".");
        logger.debug("Setting auth token:", {
          tokenLength: token.length,
          tokenParts: tokenParts.length,
          tokenPreview: `${token.substring(0, 20)}...${token.substring(token.length - 20)}`,
        });
        if (tokenParts.length !== 3) {
          throw new Error(`Invalid JWT format before setAuth: ${tokenParts.length} parts`);
        }
        this.client.setAuth(token);
      } catch (error) {
        logger.error("Failed to get JWT token:", error);
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

  async refreshAuth(): Promise<void> {
    this.client.clearAuth();
    await this.ensureAuth();
  }

  async getCurrentUser(): Promise<User> {
    const result = await this.withAuth(() => this.client.query(api.user.getCurrentUser, {}));
    return {
      ...result,
      image: result.image ?? undefined,
    } as User;
  }

  async getUserPublicKeyByEmail(email: string): Promise<{ publicKey: string } | null> {
    return this.withAuth(() => this.client.query(api.user.getUserPublicKeyByEmail, { email }));
  }

  async hasUserKeys(): Promise<boolean> {
    const result = await this.withAuth(() => this.client.query(api.userKey.hasUserKeys, {}));
    return result.hasKeys;
  }

  async storeUserKeys(args: {
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
  }): Promise<void> {
    await this.withAuth(() => this.client.mutation(api.userKey.storeUserKeys, args));
  }

  async updatePassword(args: { encryptedPrivateKey: string; salt: string }): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.userKey.updatePassword, {
        newEncryptedPrivateKey: args.encryptedPrivateKey,
        newSalt: args.salt,
      }),
    );
  }

  async rotateUserKeys(args: {
    newPublicKey: string;
    newEncryptedPrivateKey: string;
    newSalt: string;
    rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    rewrappedOwnedProjects: Array<{ projectId: string; newEncryptedProjectKey: string }>;
  }): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.userKey.rotateUserKeys, {
        newPublicKey: args.newPublicKey,
        newEncryptedPrivateKey: args.newEncryptedPrivateKey,
        newSalt: args.newSalt,
        rewrappedShares: args.rewrappedShares.map((s) => ({
          shareId: toId<"projectShare">(s.shareId),
          newEncryptedProjectKey: s.newEncryptedProjectKey,
        })),
        rewrappedOwnedProjects: args.rewrappedOwnedProjects.map((p) => ({
          projectId: toId<"project">(p.projectId),
          newEncryptedProjectKey: p.newEncryptedProjectKey,
        })),
      }),
    );
  }

  async listProjects(): Promise<ProjectListItem[]> {
    const result = await this.withAuth(() => this.client.query(api.project.listUserProjects, {}));
    return result.projects.map((p) => ({
      ...p,
      id: String(p.id),
    })) as ProjectListItem[];
  }

  async getProject(projectId: string): Promise<Project> {
    const result = await this.withAuth(() =>
      this.client.query(api.project.getProject, { projectId: toId<"project">(projectId) }),
    );
    return {
      ...result,
      id: String(result.id),
      shareUsageCount: 0,
    } as Project;
  }

  async createProject(args: {
    name: string;
    encryptedProjectKey: string;
    confirmPayment?: boolean;
  }): Promise<CreateProjectResult> {
    return this.withAuth(() => this.client.action(api.project.createProject, args));
  }

  async updateProject(args: { projectId: string; name: string }): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.project.updateProject, {
        projectId: toId<"project">(args.projectId),
        name: args.name,
      }),
    );
  }

  async archiveProject(projectId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.action(api.project.archiveProject, { projectId: toId<"project">(projectId) }),
    );
  }

  async unarchiveProject(projectId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.action(api.project.unarchiveProject, { projectId: toId<"project">(projectId) }),
    );
  }

  async getLimits(): Promise<{ usage: number; includedUsage: number }> {
    return this.withAuth(() => this.client.action(api.project.getLimits, {}));
  }

  async getProjectLimits(): Promise<ProjectLimits> {
    const result = await this.withAuth(() => this.client.action(api.project.getProjectLimits, {}));
    return {
      ...result,
      unusedProjects: result.unusedProjects ?? 0,
    } as ProjectLimits;
  }

  async getProjectEnvironments(projectId: string): Promise<Environment[]> {
    const result = await this.withAuth(() =>
      this.client.query(api.environment.getProjectEnvironments, {
        projectId: toId<"project">(projectId),
      }),
    );
    return result.map((e) => ({
      ...e,
      id: String(e.id),
      projectId: String(e.projectId),
    })) as Environment[];
  }

  async getEnvironmentData(environmentId: string): Promise<EnvironmentData> {
    const result = await this.withAuth(() =>
      this.client.query(api.environment.getEnvironmentData, {
        environmentId: toId<"environment">(environmentId),
      }),
    );
    return {
      ...result,
      secrets: result.secrets.map((s) => ({
        ...s,
        id: String(s.id),
        environmentId: String(s.environmentId),
        folderId: s.folderId ? String(s.folderId) : undefined,
      })),
      folders: result.folders.map((f) => ({
        ...f,
        id: String(f.id),
        environmentId: String(f.environmentId),
      })),
    } as EnvironmentData;
  }

  async createEnvironment(args: {
    projectId: string;
    name: string;
    color?: string;
  }): Promise<{ id: string }> {
    // Note: color parameter is not supported by backend yet
    const result = await this.withAuth(() =>
      this.client.mutation(api.environment.createEnvironment, {
        projectId: toId<"project">(args.projectId),
        name: args.name,
      }),
    );
    return { id: String(result.id) };
  }

  async updateEnvironment(args: {
    environmentId: string;
    name: string;
    color?: string;
  }): Promise<void> {
    // Note: color parameter is not supported by backend yet
    await this.withAuth(() =>
      this.client.mutation(api.environment.updateEnvironment, {
        environmentId: toId<"environment">(args.environmentId),
        name: args.name,
      }),
    );
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.environment.deleteEnvironment, {
        environmentId: toId<"environment">(environmentId),
      }),
    );
  }

  async createFolder(args: { environmentId: string; name: string }): Promise<{ id: string }> {
    const result = await this.withAuth(() =>
      this.client.mutation(api.folder.createFolder, {
        environmentId: toId<"environment">(args.environmentId),
        name: args.name,
      }),
    );
    return { id: String(result.id) };
  }

  async updateFolder(args: { folderId: string; name: string }): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.folder.updateFolder, {
        folderId: toId<"folder">(args.folderId),
        name: args.name,
      }),
    );
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.folder.deleteFolder, { folderId: toId<"folder">(folderId) }),
    );
  }

  async createSecret(args: {
    environmentId: string;
    folderId?: string;
    key: string;
    encryptedValue: string;
    valueType?: SecretValueType;
    scope?: SecretScope;
    description?: string;
  }): Promise<{ id: string }> {
    // Note: description parameter is not supported by backend yet
    const result = await this.withAuth(() =>
      this.client.mutation(api.secret.createSecret, {
        environmentId: toId<"environment">(args.environmentId),
        folderId: args.folderId ? toId<"folder">(args.folderId) : undefined,
        key: args.key,
        encryptedValue: args.encryptedValue,
        valueType: (args.valueType ?? "string") as "string" | "number" | "boolean",
        scope: args.scope as "client" | "server" | "shared" | undefined,
      }),
    );
    return { id: String(result.id) };
  }

  async updateSecretBulk(args: {
    environmentId: string;
    folderId?: string;
    secrets: Array<{
      secretId?: string;
      key: string;
      encryptedValue: string;
      valueType: SecretValueType;
      scope?: SecretScope;
    }>;
    mode?: "skip" | "overwrite";
  }): Promise<{
    success: boolean;
    updatedCount: number;
    createdCount: number;
    skippedCount: number;
    secretIds: string[];
  }> {
    const result = await this.withAuth(() =>
      this.client.mutation(api.secret.updateSecretBulk, {
        environmentId: toId<"environment">(args.environmentId),
        folderId: args.folderId ? toId<"folder">(args.folderId) : undefined,
        secrets: args.secrets.map((s) => ({
          secretId: s.secretId ? toId<"secret">(s.secretId) : undefined,
          key: s.key,
          encryptedValue: s.encryptedValue,
          valueType: s.valueType as "string" | "number" | "boolean",
          scope: s.scope as "client" | "server" | "shared" | undefined,
        })),
        mode: args.mode,
      }),
    );
    return {
      ...result,
      secretIds: result.secretIds.map((id) => String(id)),
    };
  }

  async getSecret(secretId: string): Promise<Secret> {
    const result = await this.withAuth(() =>
      this.client.query(api.secret.getSecret, { secretId: toId<"secret">(secretId) }),
    );
    return {
      ...result,
      id: String(result.id),
      environmentId: String(result.environmentId),
      folderId: result.folderId ? String(result.folderId) : undefined,
    } as Secret;
  }

  async getAllSecretsForProject(
    projectId: string,
  ): Promise<Array<{ id: string; environmentId: string; encryptedValue: string }>> {
    const result = await this.withAuth(() =>
      this.client.query(api.secret.getAllSecretsForProject, {
        projectId: toId<"project">(projectId),
      }),
    );
    return result.map((s) => ({
      id: String(s.id),
      environmentId: String(s.environmentId),
      encryptedValue: s.encryptedValue,
    }));
  }

  async updateSecret(args: {
    secretId: string;
    key?: string;
    encryptedValue?: string;
    valueType?: SecretValueType;
    scope?: SecretScope;
    description?: string;
  }): Promise<void> {
    // Note: description parameter is not supported by backend yet
    await this.withAuth(() =>
      this.client.mutation(api.secret.updateSecret, {
        secretId: toId<"secret">(args.secretId),
        updates: {
          key: args.key,
          encryptedValue: args.encryptedValue,
          valueType: (args.valueType ?? BackendSecretValueType.String) as BackendSecretValueType,
          scope: args.scope as "client" | "server" | "shared" | undefined,
        },
      }),
    );
  }

  async deleteSecret(secretId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.mutation(api.secret.deleteSecret, { secretId: toId<"secret">(secretId) }),
    );
  }

  async shareProject(args: {
    projectId: string;
    userEmail: string;
    encryptedProjectKey: string;
    confirmPayment?: boolean;
  }): Promise<ShareProjectResult> {
    return this.withAuth(() =>
      this.client.action(api.projectShare.shareProject, {
        projectId: toId<"project">(args.projectId),
        userEmail: args.userEmail,
        encryptedProjectKey: args.encryptedProjectKey,
        confirmPayment: args.confirmPayment,
      }),
    );
  }

  async revokeShare(shareId: string): Promise<void> {
    await this.withAuth(() =>
      this.client.action(api.projectShare.revokeShare, { shareId: toId<"projectShare">(shareId) }),
    );
  }

  async listProjectShares(projectId: string): Promise<{ shares: SharedUser[] }> {
    const result = await this.withAuth(() =>
      this.client.query(api.projectShare.listActiveProjectSharesByProject, {
        projectId: toId<"project">(projectId),
      }),
    );
    return {
      shares: result.shares.map((share: ApiShareResponse) => ({
        id: String(share.id),
        email: share.userEmail,
        name: share.userName,
        publicKey: share.userPublicKey,
        sharedAt: share.sharedAt,
      })),
    };
  }

  async listSharedProjects(): Promise<ProjectListItem[]> {
    const result = await this.withAuth(() =>
      this.client.query(api.projectShare.listActiveSharedProjectsForCurrentUser, {}),
    );
    return result.shares.map((share: ApiSharedProjectResponse) => ({
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

  async getProjectShare(projectId: string): Promise<{ encryptedProjectKey: string } | null> {
    return this.withAuth(() =>
      this.client.query(api.projectShare.getProjectShareByProjectForCurrentUser, {
        projectId: toId<"project">(projectId),
      }),
    );
  }

  async revokeShareWithRotation(args: {
    shareId: string;
    newEncryptedProjectKey: string;
    rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    reEncryptedSecrets: Array<{ secretId: string; newEncryptedValue: string }>;
  }): Promise<void> {
    await this.withAuth(() =>
      this.client.action(api.projectShare.revokeShareWithRotation, {
        shareId: toId<"projectShare">(args.shareId),
        newEncryptedProjectKey: args.newEncryptedProjectKey,
        rewrappedShares: args.rewrappedShares.map((s) => ({
          shareId: toId<"projectShare">(s.shareId),
          newEncryptedProjectKey: s.newEncryptedProjectKey,
        })),
        reEncryptedSecrets: args.reEncryptedSecrets.map((s) => ({
          secretId: toId<"secret">(s.secretId),
          newEncryptedValue: s.newEncryptedValue,
        })),
      }),
    );
  }

  async getProPlan(): Promise<{ url: string }> {
    const result = await this.withAuth(() => this.client.action(api.user.getProPlan, {}));
    return { url: result.checkoutLink ?? "" };
  }

  async checkProPlan(): Promise<{ hasPro: boolean }> {
    const result = await this.withAuth(() => this.client.action(api.user.checkProPlan, {}));
    return { hasPro: result.hasProPlan };
  }

  async getShareLimits(projectId: string): Promise<ShareLimits> {
    return this.withAuth(() =>
      this.client.action(api.projectShare.getShareLimits, {
        projectId: toId<"project">(projectId),
      }),
    );
  }

  async loadLastPulse(environmentId: string): Promise<ActionLog | null> {
    return this.withAuth(async () => {
      const result = await this.client.action(api.actionLog.loadActionLogsByEnvironment, {
        environmentId: toId<"environment">(environmentId),
        paginationOpts: { numItems: 1, cursor: null },
      });
      const firstLog = result.page[0];
      if (!firstLog) return null;
      return {
        ...firstLog,
        id: String(firstLog._id),
        environmentId: String(firstLog.environmentId ?? ""),
        userId: String(firstLog.userId ?? ""),
      } as ActionLog;
    });
  }
}

let protectedApiInstance: ProtectedApi | null = null;

export function getProtectedApi(): ProtectedApi {
  if (!protectedApiInstance) {
    protectedApiInstance = new ProtectedApi();
  }
  return protectedApiInstance;
}

export function clearProtectedApi(): void {
  protectedApiInstance = null;
}
