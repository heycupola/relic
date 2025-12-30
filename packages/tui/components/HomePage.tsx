import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { STATUS_COLORS, THEME_COLORS } from "../lib/constants";
import type { Project, ProjectStatus } from "../lib/types";
import { usePaste } from "../lib/usePaste";
import { useTaskQueue } from "../lib/useTaskQueue";
import { useTextInput } from "../lib/useTextInput";
import { GuideBar } from "./GuideBar";
import { Modal } from "./Modal";
import { TextInput } from "./TextInput";

type ModalType = "none" | "create" | "logout";

interface HomePageProps {
  userName: string;
  onSelectProject: (projectId: string, projectName: string, projectStatus: ProjectStatus) => void;
  onLogout: () => void;
}

const MOCK_PROJECTS: Project[] = [
  { id: "1", name: "api-gateway", status: "owned" },
  { id: "2", name: "user-service", status: "shared" },
  { id: "3", name: "payment-service", status: "archived" },
];

const STATUS_ICONS: Record<ProjectStatus, string> = {
  owned: "●",
  shared: "◐",
  archived: "○",
};

const PROJECT_NAME_MAX_LENGTH = 50;

export function HomePage({ userName, onSelectProject, onLogout }: HomePageProps) {
  const { width, height } = useTerminalDimensions();
  const { runTask, showSuccess } = useTaskQueue();

  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [cursorVisible, setCursorVisible] = useState(true);

  const projectNameInput = useTextInput({
    maxLength: PROJECT_NAME_MAX_LENGTH,
    onSubmit: (value) => {
      if (value.trim()) {
        closeModal();
        runTask(`Creating project "${value}"...`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }).then(() => {
          showSuccess(`Project "${value}" created`);
        });
      }
    },
  });

  useEffect(() => {
    if (activeModal === "none") return;
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [activeModal]);

  const handlePaste = useCallback(
    (text: string) => {
      if (activeModal === "create") {
        setCursorVisible(true);
        projectNameInput.handlePaste(text);
      }
    },
    [activeModal, projectNameInput],
  );

  usePaste(handlePaste);

  const moveUp = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
  };

  const moveDown = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
  };

  const selectProject = () => {
    const project = projects[selectedIndex];
    if (project) {
      onSelectProject(project.id, project.name, project.status);
    }
  };

  const closeModal = () => {
    setActiveModal("none");
    projectNameInput.reset();
  };

  const confirmLogout = () => {
    onLogout();
  };

  useKeyboard((key) => {
    setCursorVisible(true);

    if (activeModal === "create") {
      if (key.name === "escape") {
        closeModal();
      } else if (!projectNameInput.handleKey(key)) {
        return;
      }
      return;
    }

    if (activeModal === "logout") {
      if (key.name === "y") {
        confirmLogout();
      } else if (key.name === "n" || key.name === "escape") {
        closeModal();
      }
      return;
    }

    if (key.name === "k" || key.name === "up") {
      moveUp();
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
    } else if (key.name === "return") {
      selectProject();
    } else if (key.name === "n") {
      setActiveModal("create");
    } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setActiveModal("logout");
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const getShortcuts = () => {
    if (activeModal === "create") {
      return [
        { key: "↵", description: "create" },
        { key: "esc", description: "cancel" },
      ];
    }
    if (activeModal === "logout") {
      return [
        { key: "↵", description: "confirm" },
        { key: "esc", description: "cancel" },
      ];
    }
    return [
      { key: "↑/k", description: "up" },
      { key: "↓/j", description: "down" },
      { key: "↵", description: "select" },
      { key: "n", description: "new project" },
      { key: "ctrl+l", description: "logout" },
      { key: "q", description: "quit" },
    ];
  };

  return (
    <box
      flexDirection="column"
      width={width}
      height={height}
      backgroundColor={THEME_COLORS.background}
    >
      <box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        backgroundColor={THEME_COLORS.background}
      >
        <box
          flexDirection="column"
          alignItems="center"
          backgroundColor={THEME_COLORS.header}
          width={50}
          paddingTop={2}
          paddingBottom={2}
          paddingLeft={2}
          paddingRight={2}
        >
          {/* ASCII relic logo */}
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          <box height={1} marginBottom={1}>
            <text fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</text>
          </box>

          {/* Projects heading with count */}
          <box
            height={1}
            width={44}
            marginTop={1}
            marginBottom={1}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <text fg={THEME_COLORS.textMuted}> Projects</text>
            <text fg={THEME_COLORS.textDim}>{projects.length} / 10</text>
          </box>

          {/* Project List */}
          <box flexDirection="column" width={44}>
            {projects.length === 0 ? (
              <box height={1}>
                <text fg={THEME_COLORS.textDim}>No projects yet. Press 'n' to create one.</text>
              </box>
            ) : (
              projects.map((project, index) => {
                const isSelected = index === selectedIndex;
                const statusColor = STATUS_COLORS[project.status];
                const statusIcon = STATUS_ICONS[project.status];

                return (
                  <box
                    key={project.id}
                    height={1}
                    width={44}
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <text fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                      <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                        {isSelected ? "› " : "  "}
                      </span>
                      {project.name}
                    </text>
                    <text>
                      {isSelected && <span fg={THEME_COLORS.textDim}>[{project.status}] </span>}
                      <span fg={statusColor}>{statusIcon}</span>
                    </text>
                  </box>
                );
              })
            )}
          </box>
        </box>
      </box>

      <Modal
        visible={activeModal === "create"}
        title="Create New Project"
        width={50}
        height={8}
        shortcuts={[
          { key: "↵", description: "create" },
          { key: "esc", description: "cancel" },
        ]}
      >
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={THEME_COLORS.textMuted}>Enter project name:</text>
          <TextInput
            value={projectNameInput.value}
            cursor={projectNameInput.cursor}
            cursorVisible={cursorVisible}
            width={40}
            maxLength={PROJECT_NAME_MAX_LENGTH}
          />
        </box>
      </Modal>

      <Modal
        visible={activeModal === "logout"}
        title="Logout"
        width={40}
        height={6}
        shortcuts={[
          { key: "y", description: "yes" },
          { key: "n", description: "no" },
        ]}
      >
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={THEME_COLORS.text}>Are you sure you want to logout?</text>
        </box>
      </Modal>

      {activeModal === "none" && <GuideBar shortcuts={getShortcuts()} />}
    </box>
  );
}
