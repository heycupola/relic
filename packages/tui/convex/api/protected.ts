import { ConvexHttpClient } from "convex/browser";
import { logger } from "../../utils/debugLog";
import { ensureValidJwt } from "../services/jwt";
import type {
  EnvironmentData,
  Project,
  ProjectListItem,
  Secret,
  SecretScope,
  SecretValueType,
  SharedUser,
  User,
} from "./types";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://localhost:3210";

function createClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}

export class ProtectedApi {
  private client: ConvexHttpClient;
  private authPromise: Promise<void> | null = null;

  constructor() {
    this.client = createClient();
  }

  // Ensure auth is set - uses ensureValidJwt() which handles caching and auto-refresh
  // ensureValidJwt() automatically:
  // - Returns cached token if valid (with 1 min buffer before expiry)
  // - Fetches new token if expired or missing
  async ensureAuth(): Promise<void> {
    // If auth is already being set, wait for it
    if (this.authPromise) {
      await this.authPromise;
      return;
    }

    // Set auth (ensureValidJwt handles token caching and refresh automatically)
    this.authPromise = (async () => {
      try {
        const token = await ensureValidJwt();
        // ConvexHttpClient.setAuth expects a token string directly
        this.client.setAuth(token as any);
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

  // Helper to execute API calls with auth - ensures token is set before each call
  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAuth();
    return fn();
  }

  // Public method to refresh auth (e.g., after getting 401)
  async refreshAuth(): Promise<void> {
    this.client.clearAuth();
    await this.ensureAuth();
  }

  // User
  async getCurrentUser(): Promise<User> {
    return this.withAuth(() => this.client.query("user:getCurrentUser", {}));
  }

  // User Keys
  async hasUserKeys(): Promise<boolean> {
    const result = await this.withAuth(() => this.client.query("userKey:hasUserKeys", {}));
    return result.hasKeys;
  }

  async storeUserKeys(args: {
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
  }): Promise<void> {
    return this.withAuth(() => this.client.mutation("userKey:storeUserKeys", args));
  }

  async updatePassword(args: { encryptedPrivateKey: string; salt: string }): Promise<void> {
    return this.withAuth(() =>
      this.client.mutation("userKey:updatePassword", {
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
    return this.withAuth(() => this.client.mutation("userKey:rotateUserKeys", args));
  }

  // Projects
  async listProjects(): Promise<ProjectListItem[]> {
    const result = await this.withAuth(() => this.client.query("project:listUserProjects", {}));
    return result.projects;
  }

  async getProject(projectId: string): Promise<Project> {
    return this.withAuth(() => this.client.query("project:getProject", { projectId }));
  }

  async createProject(args: { name: string; encryptedProjectKey: string }): Promise<string> {
    return this.withAuth(() => this.client.action("project:createProject", args));
  }

  async updateProject(args: { projectId: string; name: string }): Promise<void> {
    return this.withAuth(() => this.client.mutation("project:updateProject", args));
  }

  async archiveProject(projectId: string): Promise<void> {
    return this.withAuth(() => this.client.action("project:archiveProject", { projectId }));
  }

  async unarchiveProject(projectId: string): Promise<void> {
    return this.withAuth(() => this.client.action("project:unarchiveProject", { projectId }));
  }

  async getLimits(): Promise<{ usage: number; included_usage: number }> {
    return this.withAuth(() => this.client.action("project:getLimits", {}));
  }

  // Environments
  async getEnvironmentData(environmentId: string): Promise<EnvironmentData> {
    return this.withAuth(() =>
      this.client.query("environment:getEnvironmentData", { environmentId }),
    );
  }

  async createEnvironment(args: {
    projectId: string;
    name: string;
    color?: string;
  }): Promise<string> {
    return this.withAuth(() => this.client.mutation("environment:createEnvironment", args));
  }

  async updateEnvironment(args: {
    environmentId: string;
    name: string;
    color?: string;
  }): Promise<void> {
    return this.withAuth(() => this.client.mutation("environment:updateEnvironment", args));
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    return this.withAuth(() =>
      this.client.mutation("environment:deleteEnvironment", { environmentId }),
    );
  }

  // Folders
  async createFolder(args: { environmentId: string; name: string }): Promise<string> {
    return this.withAuth(() => this.client.mutation("folder:createFolder", args));
  }

  async updateFolder(args: { folderId: string; name: string }): Promise<void> {
    return this.withAuth(() => this.client.mutation("folder:updateFolder", args));
  }

  async deleteFolder(folderId: string): Promise<void> {
    return this.withAuth(() => this.client.mutation("folder:deleteFolder", { folderId }));
  }

  // Secrets
  async createSecret(args: {
    environmentId: string;
    folderId?: string;
    key: string;
    encryptedValue: string;
    valueType?: SecretValueType;
    scope?: SecretScope;
    description?: string;
  }): Promise<string> {
    return this.withAuth(() => this.client.mutation("secret:createSecret", args));
  }

  async getSecret(secretId: string): Promise<Secret> {
    return this.withAuth(() => this.client.query("secret:getSecret", { secretId }));
  }

  async updateSecret(args: {
    secretId: string;
    key?: string;
    encryptedValue?: string;
    valueType?: SecretValueType;
    scope?: SecretScope;
    description?: string;
  }): Promise<void> {
    return this.withAuth(() => this.client.mutation("secret:updateSecret", args));
  }

  async deleteSecret(secretId: string): Promise<void> {
    return this.withAuth(() => this.client.mutation("secret:deleteSecret", { secretId }));
  }

  // Project Sharing
  async shareProject(args: {
    projectId: string;
    email: string;
    encryptedProjectKey: string;
  }): Promise<void> {
    return this.withAuth(() => this.client.action("projectShare:shareProject", args));
  }

  async revokeShare(shareId: string): Promise<void> {
    return this.withAuth(() => this.client.action("projectShare:revokeShare", { shareId }));
  }

  async listProjectShares(projectId: string): Promise<SharedUser[]> {
    return this.withAuth(() =>
      this.client.query("projectShare:listActiveProjectSharesByProject", { projectId }),
    );
  }

  async listSharedProjects(): Promise<ProjectListItem[]> {
    return this.withAuth(() =>
      this.client.query("projectShare:listActiveSharedProjectsForCurrentUser", {}),
    );
  }

  async getProjectShare(projectId: string): Promise<{ encryptedProjectKey: string } | null> {
    return this.withAuth(() =>
      this.client.query("projectShare:getProjectShareByProjectForCurrentUser", { projectId }),
    );
  }

  async revokeShareWithRotation(args: {
    shareId: string;
    newEncryptedProjectKey: string;
    rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    reEncryptedSecrets: Array<{ secretId: string; newEncryptedValue: string }>;
  }): Promise<void> {
    return this.withAuth(() => this.client.action("projectShare:revokeShareWithRotation", args));
  }

  // Pro Plan
  async getProPlan(): Promise<{ url: string }> {
    return this.withAuth(() => this.client.action("user:getProPlan", {}));
  }

  async checkProPlan(): Promise<{ hasPro: boolean }> {
    return this.withAuth(() => this.client.action("user:checkProPlan", {}));
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
