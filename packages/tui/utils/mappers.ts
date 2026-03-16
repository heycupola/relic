import type {
  Environment as ApiEnvironment,
  Folder as ApiFolder,
  Secret as ApiSecret,
  User as ApiUser,
} from "../types/api";
import type { Environment, Folder, Secret } from "../types/models";

export function mapApiEnvironment(apiEnv: ApiEnvironment): Environment {
  return {
    id: apiEnv.id,
    name: apiEnv.name,
  };
}

export function mapApiFolder(apiFolder: ApiFolder): Folder {
  return {
    id: apiFolder.id,
    name: apiFolder.name,
    environmentId: apiFolder.environmentId,
  };
}

export function mapApiSecret(apiSecret: ApiSecret): Secret {
  return {
    id: apiSecret.id,
    key: apiSecret.key,
    value: undefined,
    encryptedValue: apiSecret.encryptedValue,
    type:
      apiSecret.valueType === "string"
        ? "string"
        : apiSecret.valueType === "number"
          ? "number"
          : apiSecret.valueType === "boolean"
            ? "boolean"
            : "string",
    scope: apiSecret.scope,
    folderId: apiSecret.folderId,
    environmentId: apiSecret.environmentId,
  };
}

export function getUserDisplayName(user: ApiUser): string {
  return user.name || user.email.split("@")[0] || "User";
}
