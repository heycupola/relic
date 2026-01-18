import type { ProjectStatus, SecretScope, SecretValueType } from "./api";

export type { ProjectStatus, SecretScope, SecretValueType };

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
}

export interface Environment {
  id: string;
  name: string;
}

export interface Folder {
  id: string;
  name: string;
  environmentId: string;
}

export interface Secret {
  id: string;
  key: string;
  value?: string;
  type?: SecretValueType;
  folderId?: string;
  environmentId: string;
}

export interface SharedUser {
  id: string;
  email: string;
  name: string;
  publicKey: string | null;
}

export interface LogEntry {
  id: string;
  action: string;
  timestamp: number;
  user: string;
}

export type ViewLevel = "environments" | "environment" | "folder";

export type ModalType =
  | "none"
  | "createEnv"
  | "createFolder"
  | "createSecret"
  | "manageCollaborators"
  | "commandPalette"
  | "bulkImport"
  | "logout"
  | "password";
