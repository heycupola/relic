import { validateSession } from "@repo/auth";
import { Box, render, Text } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { type Environment, type Folder, getApi, type ProjectListItem } from "../lib/api";

type ProjectsStatus = "loading" | "success" | "not_logged_in" | "error";

interface ProjectWithDetails extends ProjectListItem {
  isShared: boolean;
  environments: Array<Environment & { folders: Folder[] }>;
}

interface ProjectsState {
  status: ProjectsStatus;
  projects: ProjectWithDetails[];
  error: string | null;
  loadingPhase: string;
}

const TREE = {
  BRANCH: "├── ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│   ",
  EMPTY: "    ",
} as const;

function ProjectTree({ projects }: { projects: ProjectWithDetails[] }) {
  if (projects.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No projects found</Text>
        <Text dimColor>Create one at app.relic.so</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Your Projects</Text>
      <Text> </Text>
      {projects.map((project, projectIndex) => {
        const isLastProject = projectIndex === projects.length - 1;
        const projectPrefix = isLastProject ? TREE.LAST_BRANCH : TREE.BRANCH;
        const childPrefix = isLastProject ? TREE.EMPTY : TREE.VERTICAL;

        const projectLabel = project.name;
        const badges: string[] = [];

        if (project.isShared) badges.push("shared");
        if (project.isArchived) badges.push("archived");

        const badgeText = badges.length > 0 ? ` (${badges.join(", ")})` : "";

        return (
          <Box key={project.id} flexDirection="column">
            <Box>
              <Text dimColor>{projectPrefix}</Text>
              <Text bold={!project.isArchived} dimColor={project.isArchived}>
                {projectLabel}
              </Text>
              {badgeText && <Text dimColor>{badgeText}</Text>}
            </Box>

            {project.environments.map((env, envIndex) => {
              const isLastEnv = envIndex === project.environments.length - 1;
              const envPrefix = isLastEnv ? TREE.LAST_BRANCH : TREE.BRANCH;
              const envChildPrefix = isLastEnv ? TREE.EMPTY : TREE.VERTICAL;

              return (
                <Box key={env.id} flexDirection="column">
                  <Box>
                    <Text dimColor>{childPrefix}</Text>
                    <Text dimColor>{envPrefix}</Text>
                    <Text color={env.color || undefined}>{env.name}</Text>
                  </Box>

                  {env.folders.map((folder, folderIndex) => {
                    const isLastFolder = folderIndex === env.folders.length - 1;
                    const folderPrefix = isLastFolder ? TREE.LAST_BRANCH : TREE.BRANCH;

                    return (
                      <Box key={folder.id}>
                        <Text dimColor>{childPrefix}</Text>
                        <Text dimColor>{envChildPrefix}</Text>
                        <Text dimColor>{folderPrefix}</Text>
                        <Text dimColor>{folder.name}/</Text>
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

function ProjectsFlow() {
  const [state, setState] = useState<ProjectsState>({
    status: "loading",
    projects: [],
    error: null,
    loadingPhase: "Connecting...",
  });

  useEffect(() => {
    async function fetchProjects() {
      try {
        const sessionValidation = await validateSession();
        if (!sessionValidation.isValid || sessionValidation.isExpired) {
          setState((prev) => ({ ...prev, status: "not_logged_in" }));
          return;
        }

        const api = getApi();

        setState((prev) => ({ ...prev, loadingPhase: "Fetching projects..." }));

        const [ownedProjects, sharedProjects] = await Promise.all([
          api.listProjects(),
          api.listSharedProjects(),
        ]);

        const allProjects: ProjectWithDetails[] = [
          ...ownedProjects.map((p) => ({
            ...p,
            isShared: false,
            environments: [] as Array<Environment & { folders: Folder[] }>,
          })),
          ...sharedProjects.map((p) => ({
            ...p,
            isShared: true,
            environments: [] as Array<Environment & { folders: Folder[] }>,
          })),
        ];

        setState((prev) => ({ ...prev, loadingPhase: "Fetching environments..." }));

        const projectsWithEnvs = await Promise.all(
          allProjects.map(async (project) => {
            try {
              const environments = await api.getProjectEnvironments(project.id);
              return {
                ...project,
                environments: environments.map((e) => ({ ...e, folders: [] as Folder[] })),
              };
            } catch {
              return { ...project, environments: [] };
            }
          }),
        );

        setState((prev) => ({ ...prev, loadingPhase: "Fetching folders..." }));

        const projectsWithFolders = await Promise.all(
          projectsWithEnvs.map(async (project) => {
            const environmentsWithFolders = await Promise.all(
              project.environments.map(async (env) => {
                try {
                  const data = await api.getEnvironmentData(env.id);
                  return { ...env, folders: data.folders };
                } catch {
                  return { ...env, folders: [] };
                }
              }),
            );
            return { ...project, environments: environmentsWithFolders };
          }),
        );

        setState({
          status: "success",
          projects: projectsWithFolders,
          error: null,
          loadingPhase: "",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch projects";
        setState((prev) => ({ ...prev, status: "error", error: message }));
      }
    }

    fetchProjects();
  }, []);

  useEffect(() => {
    if (state.status === "success" || state.status === "not_logged_in") {
      setTimeout(() => process.exit(0), 100);
    }
    if (state.status === "error") {
      setTimeout(() => process.exit(1), 100);
    }
  }, [state.status]);

  return (
    <Box flexDirection="column" padding={1}>
      {state.status === "loading" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> {state.loadingPhase}</Text>
        </Box>
      )}

      {state.status === "not_logged_in" && (
        <Box flexDirection="column">
          <Text color="yellow">Not logged in</Text>
          <Text dimColor>Run `relic login` to authenticate</Text>
        </Box>
      )}

      {state.status === "success" && <ProjectTree projects={state.projects} />}

      {state.status === "error" && <Text color="red">Error: {state.error}</Text>}
    </Box>
  );
}

export function projects() {
  render(<ProjectsFlow />);
}

export default projects;
