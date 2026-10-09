import type {
  Environment,
  Folder,
  Secret,
  SecretScope,
  SecretValueType,
  ViewLevel,
} from "../types/models";

export type ProjectItem =
  | { type: "env" | "folder"; id: string; name: string }
  | {
      type: "secret";
      id: string;
      name: string;
      value: string | null;
      secretType: SecretValueType;
      secretScope: SecretScope;
    };

export interface ProjectLocation {
  viewLevel: ViewLevel;
  environmentId: string | null;
  folderId: string | null;
}

export function secretsInView(secrets: Secret[], location: ProjectLocation): Secret[] {
  if (location.viewLevel === "folder" && location.folderId) {
    return secrets.filter((s) => s.folderId === location.folderId);
  }
  if (location.viewLevel === "environment" && location.environmentId) {
    return secrets.filter((s) => s.environmentId === location.environmentId && !s.folderId);
  }
  return [];
}

function toSecretItem(secret: Secret, values: ReadonlyMap<string, string> | null): ProjectItem {
  return {
    type: "secret",
    id: secret.id,
    name: secret.key,
    value: values?.get(secret.id) ?? null,
    secretType: secret.type || "string",
    secretScope: secret.scope || "shared",
  };
}

export function buildProjectItems(
  location: ProjectLocation,
  environments: Environment[],
  folders: Folder[],
  secrets: Secret[],
  values: ReadonlyMap<string, string> | null = null,
): ProjectItem[] {
  if (location.viewLevel === "environments") {
    return environments.map((e) => ({ type: "env", id: e.id, name: e.name }));
  }
  const folderItems: ProjectItem[] =
    location.viewLevel === "environment"
      ? folders
          .filter((f) => f.environmentId === location.environmentId)
          .map((f) => ({ type: "folder", id: f.id, name: f.name }))
      : [];
  return [...folderItems, ...secretsInView(secrets, location).map((s) => toSecretItem(s, values))];
}
