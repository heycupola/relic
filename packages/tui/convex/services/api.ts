import { api } from "@repo/backend";
import type { ConvexHttpClient } from "convex/browser";
import { createConvexClient } from "../config";
import { ensureValidJwt } from "./jwt";

class ApiClient {
  private client: ConvexHttpClient;

  constructor() {
    this.client = createConvexClient();
  }

  private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
    const jwt = await ensureValidJwt();
    this.client.setAuth(async () => jwt);
    return fn();
  }

  async getCurrentUser() {
    return this.withAuth(() => this.client.query(api.user.getCurrentUser, {}));
  }

  async hasUserKeys() {
    return this.withAuth(() => this.client.query(api.userKey.hasUserKeys, {}));
  }

  async storeUserKeys(args: { publicKey: string; encryptedPrivateKey: string; salt: string }) {
    return this.withAuth(() => this.client.mutation(api.userKey.storeUserKeys, args));
  }

  async updatePassword(args: { encryptedPrivateKey: string; salt: string }) {
    return this.withAuth(() => this.client.mutation(api.userKey.updatePassword, args));
  }

  async listProjects() {
    return this.withAuth(() => this.client.query(api.project.listUserProjects, {}));
  }

  async getProject(projectId: string) {
    return this.withAuth(() => this.client.query(api.project.getProject, { projectId }));
  }

  async createProject(args: { name: string; encryptedProjectKey: string }) {
    return this.withAuth(() => this.client.action(api.project.createProject, args));
  }

  async updateProject(args: { projectId: string; name: string }) {
    return this.withAuth(() => this.client.mutation(api.project.updateProject, args));
  }

  async archiveProject(projectId: string) {
    return this.withAuth(() => this.client.action(api.project.archiveProject, { projectId }));
  }

  async unarchiveProject(projectId: string) {
    return this.withAuth(() => this.client.action(api.project.unarchiveProject, { projectId }));
  }

  async getEnvironmentData(environmentId: string) {
    return this.withAuth(() =>
      this.client.query(api.environment.getEnvironmentData, { environmentId }),
    );
  }

  async createEnvironment(args: { projectId: string; name: string; color?: string }) {
    return this.withAuth(() => this.client.mutation(api.environment.createEnvironment, args));
  }

  async updateEnvironment(args: { environmentId: string; name: string; color?: string }) {
    return this.withAuth(() => this.client.mutation(api.environment.updateEnvironment, args));
  }

  async deleteEnvironment(environmentId: string) {
    return this.withAuth(() =>
      this.client.mutation(api.environment.deleteEnvironment, { environmentId }),
    );
  }

  async createFolder(args: { environmentId: string; name: string }) {
    return this.withAuth(() => this.client.mutation(api.folder.createFolder, args));
  }

  async updateFolder(args: { folderId: string; name: string }) {
    return this.withAuth(() => this.client.mutation(api.folder.updateFolder, args));
  }

  async deleteFolder(folderId: string) {
    return this.withAuth(() => this.client.mutation(api.folder.deleteFolder, { folderId }));
  }

  async createSecret(args: {
    environmentId: string;
    folderId?: string;
    key: string;
    encryptedValue: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) {
    return this.withAuth(() => this.client.mutation(api.secret.createSecret, args));
  }

  async getSecret(secretId: string) {
    return this.withAuth(() => this.client.query(api.secret.getSecret, { secretId }));
  }

  async updateSecret(args: {
    secretId: string;
    key?: string;
    encryptedValue?: string;
    valueType?: "string" | "number" | "boolean";
    scope?: "client" | "server" | "shared";
    description?: string;
  }) {
    return this.withAuth(() => this.client.mutation(api.secret.updateSecret, args));
  }

  async deleteSecret(secretId: string) {
    return this.withAuth(() => this.client.mutation(api.secret.deleteSecret, { secretId }));
  }

  async shareProject(args: { projectId: string; email: string; encryptedProjectKey: string }) {
    return this.withAuth(() => this.client.action(api.projectShare.shareProject, args));
  }

  async revokeShare(shareId: string) {
    return this.withAuth(() => this.client.action(api.projectShare.revokeShare, { shareId }));
  }

  async listProjectShares(projectId: string) {
    return this.withAuth(() =>
      this.client.query(api.projectShare.listActiveProjectSharesByProject, { projectId }),
    );
  }

  // Pro Plan
  async getProPlan() {
    return this.withAuth(() => this.client.action(api.user.getProPlan, {}));
  }

  async checkProPlan() {
    return this.withAuth(() => this.client.action(api.user.checkProPlan, {}));
  }

  // User Key Rotation
  async rotateUserKeys(args: {
    newPublicKey: string;
    newEncryptedPrivateKey: string;
    newSalt: string;
    rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    rewrappedOwnedProjects: Array<{ projectId: string; newEncryptedProjectKey: string }>;
  }) {
    return this.withAuth(() => this.client.mutation(api.userKey.rotateUserKeys, args));
  }

  // Shared Projects
  async listSharedProjects() {
    return this.withAuth(() =>
      this.client.query(api.projectShare.listActiveSharedProjectsForCurrentUser, {}),
    );
  }

  async getProjectShare(projectId: string) {
    return this.withAuth(() =>
      this.client.query(api.projectShare.getProjectShareByProjectForCurrentUser, { projectId }),
    );
  }

  // Revoke with Key Rotation
  async revokeShareWithRotation(args: {
    shareId: string;
    newEncryptedProjectKey: string;
    rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    reEncryptedSecrets: Array<{ secretId: string; newEncryptedValue: string }>;
  }) {
    return this.withAuth(() => this.client.action(api.projectShare.revokeShareWithRotation, args));
  }
}

export const apiClient = new ApiClient();
