import type { Environment, Folder, ProjectListItem, ProtectedApi } from "./api";

export type EnvironmentWithFolders = Environment & { folders: Folder[] };

export interface ProjectWithDetails extends ProjectListItem {
  isShared: boolean;
  environments: EnvironmentWithFolders[];
}

export type ProjectTreeApi = Pick<
  ProtectedApi,
  "listProjects" | "listSharedProjects" | "getProjectEnvironments" | "getEnvironmentData"
>;

export async function listAllProjects(
  api: Pick<ProtectedApi, "listProjects" | "listSharedProjects">,
): Promise<Array<ProjectListItem & { isShared: boolean }>> {
  const [owned, shared] = await Promise.all([api.listProjects(), api.listSharedProjects()]);
  return [
    ...owned.map((p) => ({ ...p, isShared: false })),
    ...shared.map((p) => ({ ...p, isShared: true })),
  ];
}

export async function loadProjectTree(
  api: ProjectTreeApi,
  onStage?: (stage: "environments" | "folders") => void,
  projectId?: string,
): Promise<ProjectWithDetails[]> {
  const projects = (await listAllProjects(api)).filter((p) => !projectId || p.id === projectId);

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
