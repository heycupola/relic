import type {
  Environment as ApiEnvironment,
  EnvironmentData as ApiEnvironmentData,
  Folder as ApiFolder,
  ProjectListItem as ApiProject,
  Secret as ApiSecret,
  SharedUser as ApiSharedUser,
  User as ApiUser,
} from "../types/api";
import type { Environment, Folder, Project, Secret, SharedUser } from "../types/models";

export function mapApiProject(apiProject: ApiProject): Project {
  // API may return id or _id depending on the endpoint
  const projectWithId = apiProject as ApiProject & { id?: string };
  const projectId = projectWithId.id || apiProject._id;
  if (!projectId) {
    throw new Error(`Project ID is missing in API response: ${JSON.stringify(apiProject)}`);
  }

  const status = apiProject.status || "owned";

  return {
    id: projectId,
    name: apiProject.name,
    status,
  };
}

export function mapApiProjects(apiProjects: ApiProject[]): Project[] {
  return apiProjects.map(mapApiProject);
}

export function mapApiEnvironment(apiEnv: ApiEnvironment): Environment {
  return {
    id: apiEnv._id,
    name: apiEnv.name,
  };
}

export function mapApiFolder(apiFolder: ApiFolder): Folder {
  return {
    id: apiFolder._id,
    name: apiFolder.name,
    environmentId: apiFolder.environmentId,
  };
}

export function mapApiSecret(apiSecret: ApiSecret): Secret {
  return {
    id: apiSecret._id,
    key: apiSecret.key,
    value: undefined,
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

export function mapApiSharedUser(apiUser: ApiSharedUser): SharedUser {
  return {
    id: apiUser.id || apiUser._id,
    email: apiUser.email,
    name: apiUser.name,
    publicKey: apiUser.publicKey,
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

export function getUserDisplayName(user: ApiUser): string {
  return user.name || user.email.split("@")[0] || "User";
}
