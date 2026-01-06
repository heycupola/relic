import type {
  Environment as ApiEnvironment,
  EnvironmentData as ApiEnvironmentData,
  Folder as ApiFolder,
  ProjectListItem as ApiProject,
  Secret as ApiSecret,
  SharedUser as ApiSharedUser,
  User as ApiUser,
} from "../convex/api/types";
import type {
  Environment,
  Folder,
  Project,
  ProjectStatus,
  Secret,
  SharedUser,
} from "../types/models";

/**
 * Maps API ProjectListItem to TUI Project type
 */
export function mapApiProject(apiProject: ApiProject): Project {
  return {
    id: apiProject._id,
    name: apiProject.name,
    status: apiProject.status,
  };
}

/**
 * Maps array of API ProjectListItems to TUI Project types
 */
export function mapApiProjects(apiProjects: ApiProject[]): Project[] {
  return apiProjects.map(mapApiProject);
}

/**
 * Maps API Environment to TUI Environment type
 */
export function mapApiEnvironment(apiEnv: ApiEnvironment): Environment {
  return {
    id: apiEnv._id,
    name: apiEnv.name,
  };
}

/**
 * Maps API Folder to TUI Folder type
 */
export function mapApiFolder(apiFolder: ApiFolder): Folder {
  return {
    id: apiFolder._id,
    name: apiFolder.name,
    environmentId: apiFolder.environmentId,
  };
}

/**
 * Maps API Secret to TUI Secret type
 * Note: The actual value needs to be decrypted client-side
 */
export function mapApiSecret(apiSecret: ApiSecret): Secret {
  return {
    id: apiSecret._id,
    key: apiSecret.key,
    value: undefined, // Encrypted value needs to be decrypted
    type:
      apiSecret.valueType === "string"
        ? "string"
        : apiSecret.valueType === "number"
          ? "number"
          : apiSecret.valueType === "boolean"
            ? "boolean"
            : "string",
    folderId: apiSecret.folderId,
    environmentId: apiSecret.environmentId,
  };
}

/**
 * Maps API SharedUser to TUI SharedUser type
 */
export function mapApiSharedUser(apiUser: ApiSharedUser): SharedUser {
  return {
    id: apiUser._id,
    email: apiUser.email,
    name: apiUser.name,
  };
}

/**
 * Maps API EnvironmentData to TUI types
 */
export function mapApiEnvironmentData(data: ApiEnvironmentData): {
  environment: Environment;
  folders: Folder[];
  secrets: Secret[];
} {
  return {
    environment: mapApiEnvironment(data.environment),
    folders: data.folders.map(mapApiFolder),
    secrets: data.secrets.map(mapApiSecret),
  };
}

/**
 * Maps API User to display name
 */
export function getUserDisplayName(user: ApiUser): string {
  return user.name || user.email.split("@")[0] || "User";
}
