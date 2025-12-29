import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { GuideBar } from "./GuideBar";
import { Modal } from "./Modal";

type ProjectStatus = "owned" | "shared" | "archived";
type ModalType = "none" | "create" | "logout";

interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  owned: "#9ece6a",
  shared: "#7aa2f7",
  archived: "#565f89",
};

const MOCK_PROJECTS: Project[] = [
  { id: "1", name: "api-gateway", status: "owned" },
  { id: "2", name: "user-service", status: "shared" },
  { id: "3", name: "payment-service", status: "archived" },
];

const SHORTCUTS = [
  { key: "↑/k", description: "Up" },
  { key: "↓/j", description: "Down" },
  { key: "↵", description: "Select" },
  { key: "n", description: "New" },
  { key: "ctrl+l", description: "Logout" },
  { key: "q", description: "Quit" },
];

interface HomePageProps {
  onLogout: () => void;
  onSelectProject?: (projectId: string, projectName: string, projectStatus: ProjectStatus) => void;
}

export function HomePage({ onLogout, onSelectProject }: HomePageProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [newProjectName, setNewProjectName] = useState("");

  const moveUp = () => {
    if (activeModal !== "none") return;
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
  };

  const moveDown = () => {
    if (activeModal !== "none") return;
    setSelectedIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
  };

  const openCreateModal = () => {
    setActiveModal("create");
    setNewProjectName("");
  };

  const openLogoutModal = () => {
    setActiveModal("logout");
  };

  const closeModal = () => {
    setActiveModal("none");
    setNewProjectName("");
  };

  const createProject = () => {
    if (newProjectName.trim()) {
      const newProject: Project = {
        id: Date.now().toString(),
        name: newProjectName.trim(),
        status: "owned",
      };
      setProjects((prev) => [...prev, newProject]);
      closeModal();
    }
  };

  const selectProject = () => {
    const project = projects[selectedIndex];
    if (project && onSelectProject) {
      onSelectProject(project.id, project.name, project.status);
    }
  };

  useKeyboard((key) => {
    if (activeModal === "create") {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "return") {
        createProject();
      } else if (key.name === "backspace") {
        setNewProjectName((prev) => prev.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setNewProjectName((prev) => prev + key.sequence);
      }
      return;
    }

    if (activeModal === "logout") {
      if (key.name === "y") {
        onLogout();
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
      openCreateModal();
    } else if (key.ctrl && key.name === "l") {
      openLogoutModal();
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" width={width} height={height} backgroundColor="#0f0f14">
      <box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        backgroundColor="#0f0f14"
      >
        <box
          flexDirection="column"
          alignItems="center"
          borderStyle="single"
          borderColor="#3b4261"
          backgroundColor="#1a1b26"
          width={50}
        >
          <box height={2} justifyContent="center" alignItems="center" marginTop={1}>
            <text fg="#7aa2f7">
              <strong>relic</strong>
            </text>
          </box>

          <box height={1} marginBottom={1} flexDirection="row" gap={2}>
            <text fg="#565f89">Your Projects</text>
            <text>
              <span fg="#7aa2f7">{projects.length}</span>
              <span fg="#565f89">/</span>
              <span fg="#565f89">10</span>
            </text>
          </box>

          {projects.map((project, index) => (
            <box
              key={project.id}
              width={44}
              height={3}
              borderStyle="single"
              borderColor={index === selectedIndex ? "#7aa2f7" : "#3b4261"}
              backgroundColor={index === selectedIndex ? "#292e42" : "#1a1b26"}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={index === selectedIndex ? "#7aa2f7" : "#c0caf5"}>
                {index === selectedIndex ? "› " : "  "}
                {project.name}
              </text>
              <text fg={STATUS_COLORS[project.status]}>[{project.status}]</text>
            </box>
          ))}
        </box>
      </box>

      <Modal visible={activeModal === "create"} title="Create New Project" width={50} height={12}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#565f89">Enter project name:</text>
          <box
            width={40}
            height={3}
            borderStyle="single"
            borderColor="#7aa2f7"
            backgroundColor="#292e42"
            paddingLeft={1}
            alignItems="center"
          >
            <text fg="#c0caf5">
              {newProjectName}
              <span fg="#7aa2f7">_</span>
            </text>
          </box>
          <box height={1} />
          <box flexDirection="row" gap={2}>
            <text>
              <span fg="#9ece6a">[↵]</span>
              <span fg="#565f89"> Create</span>
            </text>
            <text>
              <span fg="#f7768e">[Esc]</span>
              <span fg="#565f89"> Cancel</span>
            </text>
          </box>
        </box>
      </Modal>

      <Modal visible={activeModal === "logout"} title="Logout" width={40} height={8}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#c0caf5">Are you sure you want to logout?</text>
          <box height={1} />
          <box flexDirection="row" gap={2}>
            <text>
              <span fg="#9ece6a">[y]</span>
              <span fg="#565f89"> Yes</span>
            </text>
            <text>
              <span fg="#f7768e">[n]</span>
              <span fg="#565f89"> No</span>
            </text>
          </box>
        </box>
      </Modal>

      {activeModal === "none" && <GuideBar shortcuts={SHORTCUTS} />}
    </box>
  );
}
