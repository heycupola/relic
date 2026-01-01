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

export function HomePage({ onSelectProject, onLogout }: HomePageProps) {
  const { width, height } = useTerminalDimensions();
  const { runTask, showSuccess } = useTaskQueue();

  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
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

  const PAGE_SIZE = 5;

  const moveUp = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : projects.length - 1;
      if (next < scrollOffset) {
        setScrollOffset(next);
      } else if (next >= scrollOffset + PAGE_SIZE) {
        setScrollOffset(Math.max(0, projects.length - PAGE_SIZE));
      }
      return next;
    });
  };

  const moveDown = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev < projects.length - 1 ? prev + 1 : 0;
      if (next >= scrollOffset + PAGE_SIZE) {
        setScrollOffset(next - PAGE_SIZE + 1);
      } else if (next < scrollOffset) {
        setScrollOffset(0);
      }
      return next;
    });
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

  const getShortcutGroups = () => ({
    primary: [
      {
        shortcuts: [
          { key: "n", description: "new project" },
          { key: "^l", description: "logout" },
        ],
      },
    ],
    secondary: [],
  });

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
          paddingTop={1}
          paddingBottom={1}
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
            <text fg={THEME_COLORS.textMuted}>Projects</text>
            <text fg={THEME_COLORS.textDim}>{projects.length} / 10</text>
          </box>

          {/* Project List */}
          <box
            flexDirection="column"
            width={44}
            height={projects.length === 0 ? 1 : Math.min(projects.length, PAGE_SIZE)}
          >
            {projects.length === 0 ? (
              <box height={1}>
                <text fg={THEME_COLORS.textDim}>No projects yet. Press 'n' to create one.</text>
              </box>
            ) : (
              projects.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((project, index) => {
                const actualIndex = index + scrollOffset;
                const isSelected = actualIndex === selectedIndex;
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

          {/* Shortcuts - inside card, minimal style */}
          {activeModal === "none" && (
            <box marginTop={1}>
              <GuideBar groups={getShortcutGroups()} customWidth={44} minimal={true} />
            </box>
          )}
        </box>
      </box>

      <Modal
        visible={activeModal === "create"}
        title="Create New Project"
        width={50}
        height={9}
        shortcuts={[
          { key: "↵", description: "create" },
          { key: "esc", description: "cancel" },
        ]}
      >
        <box flexDirection="column" alignItems="center">
          <TextInput
            value={projectNameInput.value}
            cursor={projectNameInput.cursor}
            cursorVisible={cursorVisible}
            width={40}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            label="Project name:"
          />
        </box>
      </Modal>

      <Modal
        visible={activeModal === "logout"}
        title="Logout"
        width={45}
        height={8}
        shortcuts={[
          { key: "y", description: "yes" },
          { key: "n", description: "no" },
        ]}
      >
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={THEME_COLORS.text}>Are you sure you want to logout?</text>
        </box>
      </Modal>
    </box>
  );
}
