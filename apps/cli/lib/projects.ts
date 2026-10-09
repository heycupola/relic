import type { Environment, Folder, ProjectListItem, ProtectedApi } from "./api";

export type EnvironmentWithFolders = Environment & { folders: Folder[] };

export interface ProjectWithDetails extends ProjectListItem {
  isShared: boolean;
  environments: EnvironmentWithFolders[];
}

export async function listAllProjects(
  api: ProtectedApi,
): Promise<Array<ProjectListItem & { isShared: boolean }>> {
  const [owned, shared] = await Promise.all([api.listProjects(), api.listSharedProjects()]);
  return [
    ...owned.map((p) => ({ ...p, isShared: false })),
    ...shared.map((p) => ({ ...p, isShared: true })),
  ];
}

export async function loadProjectTree(
  api: ProtectedApi,
  onStage?: (stage: "environments" | "folders") => void,
): Promise<ProjectWithDetails[]> {
  const projects = await listAllProjects(api);

  onStage?.("environments");
  const withEnvironments = await Promise.all(
    projects.map(async (project) => {
      const environments = await api.getProjectEnvironments(project.id).catch(() => []);
      return { ...project, environments };
    }),
  );

  onStage?.("folders");
  return Promise.all(
    withEnvironments.map(async (project) => ({
      ...project,
      environments: await Promise.all(
        project.environments.map(async (env) => {
          const folders = await api
            .getEnvironmentData(env.id)
            .then((data) => data.folders)
            .catch(() => []);
          return { ...env, folders };
        }),
      ),
    })),
  );
}
