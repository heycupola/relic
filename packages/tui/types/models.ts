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
  type?: "string" | "number" | "boolean" | "json";
  folderId?: string;
  environmentId: string;
}

export interface SharedUser {
  id: string;
  email: string;
  name: string;
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
  | "bulkImport";

export type ProjectStatus = "owned" | "shared" | "archived" | "restricted";

export type SecretScope = "client" | "server" | "shared";
