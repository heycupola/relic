import { validateSession } from "@repo/auth";
import { Box, render, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { useEffect, useState } from "react";
import { getApi, type ProjectListItem } from "../lib/api";
import { configExists, createConfig, getConfigFilePath, saveConfig } from "../lib/config";

type InitStatus =
  | "loading"
  | "selecting_project"
  | "saving"
  | "success"
  | "not_logged_in"
  | "error"
  | "already_initialized";

interface ProjectOption extends ProjectListItem {
  isShared: boolean;
}

interface InitState {
  status: InitStatus;
  projects: ProjectOption[];
  selectedIndex: number;
  selectedProject: ProjectOption | null;
  error: string | null;
}

function SelectList({
  items,
  selectedIndex,
}: {
  items: Array<{ id: string; label: string; dimmed?: boolean }>;
  selectedIndex: number;
}) {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={item.id}>
            <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "> " : "  "}</Text>
            <Text dimColor={item.dimmed}>{item.label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function InitFlow() {
  const [state, setState] = useState<InitState>({
    status: "loading",
    projects: [],
    selectedIndex: 0,
    selectedProject: null,
    error: null,
  });

  useInput(
    (input, key) => {
      if (state.status === "selecting_project") {
        if (key.upArrow) {
          setState((prev) => ({
            ...prev,
            selectedIndex: Math.max(0, prev.selectedIndex - 1),
          }));
        } else if (key.downArrow) {
          setState((prev) => ({
            ...prev,
            selectedIndex: Math.min(prev.projects.length - 1, prev.selectedIndex + 1),
          }));
        } else if (key.return) {
          const selectedProject = state.projects[state.selectedIndex];
          if (selectedProject) {
            setState((prev) => ({
              ...prev,
              status: "saving",
              selectedProject,
            }));
          }
        } else if (key.escape || input === "q") {
          process.exit(0);
        }
      }
    },
    { isActive: state.status === "selecting_project" },
  );

  useEffect(() => {
    async function initialize() {
      try {
        if (await configExists()) {
          setState((prev) => ({ ...prev, status: "already_initialized" }));
          return;
        }

        const sessionValidation = await validateSession();
        if (!sessionValidation.isValid || sessionValidation.isExpired) {
          setState((prev) => ({ ...prev, status: "not_logged_in" }));
          return;
        }

        const api = getApi();
        const [ownedProjects, sharedProjects] = await Promise.all([
          api.listProjects(),
          api.listSharedProjects(),
        ]);

        const allProjects: ProjectOption[] = [
          ...ownedProjects.filter((p) => !p.isArchived).map((p) => ({ ...p, isShared: false })),
          ...sharedProjects.filter((p) => !p.isArchived).map((p) => ({ ...p, isShared: true })),
        ];

        if (allProjects.length === 0) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: "No projects found. Create one at app.relic.so",
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          status: "selecting_project",
          projects: allProjects,
          selectedIndex: 0,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to initialize";
        setState((prev) => ({ ...prev, status: "error", error: message }));
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (state.status !== "saving" || !state.selectedProject) return;

    const selectedProject = state.selectedProject;

    async function save() {
      try {
        const config = createConfig(selectedProject.id, selectedProject.name);
        await saveConfig(config);
        setState((prev) => ({ ...prev, status: "success" }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save config";
        setState((prev) => ({ ...prev, status: "error", error: message }));
      }
    }

    save();
  }, [state.status, state.selectedProject]);

  useEffect(() => {
    if (state.status === "success" || state.status === "already_initialized") {
      setTimeout(() => process.exit(0), 100);
    }
    if (state.status === "error" || state.status === "not_logged_in") {
      setTimeout(() => process.exit(1), 100);
    }
  }, [state.status]);

  const projectItems = state.projects.map((p) => ({
    id: p.id,
    label: p.isShared ? `${p.name} (shared)` : p.name,
    dimmed: false,
  }));

  return (
    <Box flexDirection="column" padding={1}>
      {state.status === "loading" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Loading projects...</Text>
        </Box>
      )}

      {state.status === "saving" && (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Saving configuration...</Text>
        </Box>
      )}

      {state.status === "selecting_project" && (
        <Box flexDirection="column">
          <Text bold>? Select a project</Text>
          <Text> </Text>
          <SelectList items={projectItems} selectedIndex={state.selectedIndex} />
          <Text> </Text>
          <Text dimColor>Use arrows to navigate, Enter to select, q to quit</Text>
        </Box>
      )}

      {state.status === "success" && state.selectedProject && (
        <Box flexDirection="column">
          <Text color="green">Initialized Relic for {state.selectedProject.name}</Text>
          <Text dimColor> Config saved to {getConfigFilePath()}</Text>
        </Box>
      )}

      {state.status === "already_initialized" && (
        <Box flexDirection="column">
          <Text color="yellow">Already initialized</Text>
          <Text dimColor>Delete .relic/ directory to re-initialize</Text>
        </Box>
      )}

      {state.status === "not_logged_in" && (
        <Box flexDirection="column">
          <Text color="yellow">Not logged in</Text>
          <Text dimColor>Run `relic login` to authenticate</Text>
        </Box>
      )}

      {state.status === "error" && <Text color="red">Error: {state.error}</Text>}
    </Box>
  );
}

export function init() {
  render(<InitFlow />);
}

export default init;
