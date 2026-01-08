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
  _id: string;
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
  _id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  encryptedProjectKey: string;
  keyVersion: number;
  share_usage_count: number;
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
  _id: string;
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
  _id: string;
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
  _id: string;
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
  _id: string;
  projectId: string;
  userId: string;
  encryptedProjectKey: string;
  sharedBy: string;
  sharedAt: number;
  revokedAt?: number;
}

export interface SharedUser {
  _id: string;
  email: string;
  name: string;
  sharedAt: number;
}
