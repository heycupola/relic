export interface DeviceCodeRequest {
  clientId?: string;
  scope?: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenRequest {
  device_code: string;
}

export interface DeviceTokenResponse {
  session_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  hasPro: boolean;
  publicKey?: string;
  encryptedPrivateKey?: string;
  salt?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectStatus = "owned" | "shared" | "archived" | "restricted";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  encryptedProjectKey: string;
  keyVersion: number;
  shareUsageCount: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  status?: ProjectStatus;
  isRestricted?: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  isRestricted: boolean;
  isArchived: boolean;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  sortOrder: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  environmentId: string;
  projectId: string;
  name: string;
  slug: string;
  path: string;
  description?: string;
  parentFolderId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type SecretValueType = "string" | "number" | "boolean";
export type SecretScope = "client" | "server" | "shared";

export interface Secret {
  id: string;
  projectId: string;
  environmentId: string;
  folderId?: string;
  key: string;
  encryptedValue: string;
  valueType: SecretValueType;
  scope: SecretScope;
  description?: string;
  encryptionKeyVersion: number;
  tags?: string[];
  isDeleted: boolean;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

export interface EnvironmentData {
  environment: Environment;
  folders: Folder[];
  secrets: Secret[];
}

export interface ProjectShare {
  id: string;
  projectId: string;
  userId: string;
  encryptedProjectKey: string;
  sharedBy: string;
  sharedAt: number;
  revokedAt?: number;
}

export interface SharedUser {
  id: string;
  email: string;
  name: string;
  publicKey: string | null;
  sharedAt: number;
}

export interface ShareProjectResult {
  success: boolean;
  shareId?: string;
  requiresProPlan?: boolean;
  requiresAdditionalShare?: boolean;
  requiresConfirmation?: boolean;
  balance?: number;
  freeLimit?: number;
  paymentFailed?: boolean;
  checkoutUrl?: string | null;
  billingPortalUrl?: string | null;
  message?: string;
}

export interface ShareLimits {
  hasPro: boolean;
  freeShareLimit: number;
  purchasedSharesCount: number;
  totalSharesCount: number;
  unusedShares: number;
}

export type CreateProjectResult =
  | {
      status: "success";
      projectId: string;
      paymentFailed?: boolean;
      message?: string;
    }
  | {
      status: "requiresProPlan";
      checkoutUrl: string | null;
      message?: string;
    }
  | {
      status: "requiresConfirmation";
      balance: number;
      freeLimit: number;
      message?: string;
    };

export interface ProjectLimits {
  hasPro: boolean;
  freeLimit: number;
  totalProjectsCount: number;
  purchasedProjectsCount: number;
  unusedProjects: number;
  includedUsage: number;
}

export interface ApiShareResponse {
  id: string;
  userEmail: string;
  userName: string;
  userPublicKey: string | null;
  sharedAt: number;
}

export interface ApiSharedProjectResponse {
  projectId: string;
  projectName: string;
  projectSlug: string;
  status: string;
  isRestricted: boolean;
  isArchived: boolean;
  ownerId: string;
}

export interface ActionLog {
  _id: string;
  action: string;
  projectId?: string;
  projectName?: string;
  environmentId?: string;
  environmentName?: string;
  timestamp: number;
  userId: string;
  metadata?: {
    folderId?: string;
    folderName?: string;
    secretId?: string;
    key?: string;
    newKey?: string;
    exportFormat?: "relic" | "env" | "json";
    exportCount?: number;
    affectedValueCount?: number;
    deleteCount?: number;
    sharedUserId?: string;
    sharedUserEmail?: string;
    shareId?: string;
    reason?: string;
    oldKeyVersion?: number;
    newKeyVersion?: number;
    keyRotated?: boolean;
    secretsReEncrypted?: number;
    sharesUpdated?: number;
  };
}
