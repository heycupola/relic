import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useState } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { usePaste } from "../../hooks/usePaste";
import { useProjects } from "../../hooks/useProjects";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { ModalType, Project, ProjectStatus } from "../../types";
import { STATUS_COLORS, THEME_COLORS } from "../../utils/constants";
import { InlineInput } from "../forms/InlineInput";
import { ChangePasswordModal } from "../modals/ChangePasswordModal";
import { CommandPaletteModal } from "../modals/CommandPaletteModal";
import { DeleteConfirmation } from "../shared/DeleteConfirmation";
import { GuideBar } from "../shared/GuideBar";
import { Modal } from "../shared/Modal";

interface HomePageProps {
  userName: string;
  onSelectProject: (projectId: string, projectName: string, projectStatus: ProjectStatus) => void;
  onLogout: () => void;
}

const STATUS_ICONS: Record<ProjectStatus, string> = {
  owned: "●",
  shared: "◉",
  archived: "○",
  restricted: "Ø",
};

const _PROJECT_NAME_MAX_LENGTH = 50;

export function HomePage({ onSelectProject, onLogout }: HomePageProps) {
  const { width, height } = useTerminalDimensions();
  const { runTask, showSuccess } = useTaskQueue();

  // Fetch real projects from API
  const {
    projects,
    isLoading: isLoadingProjects,
    error: projectsError,
    refetch: refetchProjects,
  } = useProjects();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectInput, setNewProjectInput] = useState("");
  const [newProjectCursor, setNewProjectCursor] = useState(0);

  const [confirmingDelete, setConfirmingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [editingProject, setEditingProject] = useState<{
    id: string;
    originalName: string;
  } | null>(null);
  const [editProjectInput, setEditProjectInput] = useState("");
  const [editProjectCursor, setEditProjectCursor] = useState(0);

  const handlePaste = useCallback(
    (text: string) => {
      const cleanText = text.replace(/\s/g, "").slice(0, 30);
      if (creatingProject) {
        const availableSpace = 30 - newProjectInput.length;
        const textToInsert = cleanText.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setNewProjectInput(
            newProjectInput.slice(0, newProjectCursor) +
              textToInsert +
              newProjectInput.slice(newProjectCursor),
          );
          setNewProjectCursor(newProjectCursor + textToInsert.length);
        }
      } else if (editingProject) {
        const availableSpace = 30 - editProjectInput.length;
        const textToInsert = cleanText.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setEditProjectInput(
            editProjectInput.slice(0, editProjectCursor) +
              textToInsert +
              editProjectInput.slice(editProjectCursor),
          );
          setEditProjectCursor(editProjectCursor + textToInsert.length);
        }
      }
    },
    [
      creatingProject,
      newProjectInput,
      newProjectCursor,
      editingProject,
      editProjectInput,
      editProjectCursor,
    ],
  );

  usePaste(handlePaste);

  const shouldBlinkCursor = activeModal !== "none" || creatingProject || editingProject;
  const cursorVisible = useCursorBlink(shouldBlinkCursor);

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
  };

  const confirmLogout = () => {
    onLogout();
  };

  const getAllCommands = () => {
    const commands = [
      { key: "n", description: "Create project", category: "Create" },
      { key: "u", description: "Rename project", category: "Manage" },
      { key: "p", description: "Change password", category: "Account" },
      { key: "^l", description: "Logout", category: "Account" },
    ];

    // Sort commands to match CommandPaletteModal visual order
    const categoryOrder = ["Navigate", "Create", "Manage", "View", "Account"];
    return commands.sort((a, b) => {
      const idxA = categoryOrder.indexOf(a.category);
      const idxB = categoryOrder.indexOf(b.category);
      if (idxA === idxB) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  };

  const executeCommand = (key: string) => {
    if (key === "n") {
      setCreatingProject(true);
      setNewProjectInput("");
      setNewProjectCursor(0);
    } else if (key === "u") {
      const project = projects[selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setEditingProject({ id: project.id, originalName: project.name });
        setEditProjectInput(project.name);
        setEditProjectCursor(project.name.length);
      }
    } else if (key === "p") {
      setActiveModal("password");
    } else if (key === "^l") {
      setActiveModal("logout");
    }
  };

  useKeyboard((key) => {
    // Inline input handling with cursor support
    if (creatingProject) {
      // Option key sends Meta+ESC sequence
      const isOptionKey = key.meta && key.sequence === "\x1b";
      const _isCmd = key.meta && !isOptionKey;

      if (key.name === "escape") {
        setCreatingProject(false);
        setNewProjectInput("");
        setNewProjectCursor(0);
        return;
      }

      if (key.name === "return") {
        const trimmed = newProjectInput.trim();
        if (trimmed) {
          // TODO: Generate proper encrypted project key using client-side encryption
          // For now, we use a placeholder - this will be replaced with real encryption
          const placeholderKey = "encrypted-key-placeholder";

          runTask(`Creating project "${trimmed}"...`, async () => {
            const { getProtectedApi } = await import("../../convex/api/protected");
            const { ensureValidJwt } = await import("../../convex/services/jwt");
            const jwt = await ensureValidJwt();
            const api = getProtectedApi(jwt);
            await api.createProject({ name: trimmed, encryptedProjectKey: placeholderKey });
          })
            .then(() => {
              showSuccess(`Project "${trimmed}" created`);
              setCreatingProject(false);
              setNewProjectInput("");
              setNewProjectCursor(0);
              refetchProjects(); // Refresh the project list
            })
            .catch((err) => {
              // Handle error - project creation failed
              console.error("Failed to create project:", err);
            });
        }
        return;
      }

      // Arrow left with modifiers
      if (key.name === "left") {
        if (isOptionKey || key.option) {
          let pos = newProjectCursor;
          while (pos > 0 && newProjectInput[pos - 1] === " ") pos--;
          while (pos > 0 && newProjectInput[pos - 1] !== " ") pos--;
          setNewProjectCursor(pos);
        } else if (key.meta) {
          setNewProjectCursor(0);
        } else {
          setNewProjectCursor((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Arrow right with modifiers
      if (key.name === "right") {
        if (isOptionKey || key.option) {
          let pos = newProjectCursor;
          while (pos < newProjectInput.length && newProjectInput[pos] !== " ") pos++;
          while (pos < newProjectInput.length && newProjectInput[pos] === " ") pos++;
          setNewProjectCursor(pos);
        } else if (key.meta) {
          setNewProjectCursor(newProjectInput.length);
        } else {
          setNewProjectCursor((prev) => Math.min(newProjectInput.length, prev + 1));
        }
        return;
      }

      // Ignore up/down arrows
      if (key.name === "up" || key.name === "down") {
        return;
      }

      // Backspace with modifiers
      if (key.name === "backspace") {
        if (key.meta || key.option) {
          // Meta/Option+Backspace: Delete word backward
          if (newProjectCursor > 0) {
            let newPos = newProjectCursor;
            while (newPos > 0 && newProjectInput[newPos - 1] === " ") newPos--;
            while (newPos > 0 && newProjectInput[newPos - 1] !== " ") newPos--;
            setNewProjectInput(
              newProjectInput.slice(0, newPos) + newProjectInput.slice(newProjectCursor),
            );
            setNewProjectCursor(newPos);
          }
        } else {
          // Regular backspace: Delete one character
          if (newProjectCursor > 0) {
            setNewProjectInput(
              newProjectInput.slice(0, newProjectCursor - 1) +
                newProjectInput.slice(newProjectCursor),
            );
            setNewProjectCursor(newProjectCursor - 1);
          }
        }
        return;
      }

      // Delete key (forward delete)
      if (key.name === "delete") {
        if (newProjectCursor < newProjectInput.length) {
          setNewProjectInput(
            newProjectInput.slice(0, newProjectCursor) +
              newProjectInput.slice(newProjectCursor + 1),
          );
        }
        return;
      }

      // Ctrl+A: Jump to start
      if (key.name === "a" && key.ctrl) {
        setNewProjectCursor(0);
        return;
      }

      // Ctrl+E: Jump to end
      if (key.name === "e" && key.ctrl) {
        setNewProjectCursor(newProjectInput.length);
        return;
      }

      // Ctrl+U: Delete all
      if (key.name === "u" && key.ctrl) {
        setNewProjectInput("");
        setNewProjectCursor(0);
        return;
      }

      // Ctrl+W: Delete word backward
      if (key.name === "w" && key.ctrl) {
        if (newProjectCursor > 0) {
          let newPos = newProjectCursor;
          while (newPos > 0 && newProjectInput[newPos - 1] === " ") newPos--;
          while (newPos > 0 && newProjectInput[newPos - 1] !== " ") newPos--;
          setNewProjectInput(
            newProjectInput.slice(0, newPos) + newProjectInput.slice(newProjectCursor),
          );
          setNewProjectCursor(newPos);
        }
        return;
      }

      // Meta+B (Option+Left): Jump word backward
      if (key.name === "b" && key.meta) {
        let pos = newProjectCursor;
        while (pos > 0 && newProjectInput[pos - 1] === " ") pos--;
        while (pos > 0 && newProjectInput[pos - 1] !== " ") pos--;
        setNewProjectCursor(pos);
        return;
      }

      // Meta+F (Option+Right): Jump word forward
      if (key.name === "f" && key.meta) {
        let pos = newProjectCursor;
        while (pos < newProjectInput.length && newProjectInput[pos] !== " ") pos++;
        while (pos < newProjectInput.length && newProjectInput[pos] === " ") pos++;
        setNewProjectCursor(pos);
        return;
      }

      // Meta+D (Option+Delete): Delete word forward
      if (key.name === "d" && key.meta) {
        let endPos = newProjectCursor;
        while (endPos < newProjectInput.length && newProjectInput[endPos] === " ") endPos++;
        while (endPos < newProjectInput.length && newProjectInput[endPos] !== " ") endPos++;
        setNewProjectInput(
          newProjectInput.slice(0, newProjectCursor) + newProjectInput.slice(endPos),
        );
        return;
      }

      // Regular typing (30 char limit) - also handles Cmd+V paste
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const availableSpace = 30 - newProjectInput.length;
        const textToInsert = key.sequence.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setNewProjectInput(
            newProjectInput.slice(0, newProjectCursor) +
              textToInsert +
              newProjectInput.slice(newProjectCursor),
          );
          setNewProjectCursor(newProjectCursor + textToInsert.length);
        }
        return;
      }

      // Ignore all other keys
      return;
    }

    // Inline edit/rename handling
    if (editingProject) {
      // Option key sends Meta+ESC sequence
      const isOptionKey = key.meta && key.sequence === "\x1b";

      // Escape or up/down arrows cancel editing
      if (key.name === "escape" || key.name === "up" || key.name === "down") {
        setEditingProject(null);
        setEditProjectInput("");
        setEditProjectCursor(0);
        return;
      }

      // Enter saves the edit
      if (key.name === "return") {
        const trimmed = editProjectInput.trim();
        if (trimmed && trimmed !== editingProject.originalName) {
          const projectId = editingProject.id;
          runTask(`Renaming project to "${trimmed}"...`, async () => {
            const { getProtectedApi } = await import("../../convex/api/protected");
            const { ensureValidJwt } = await import("../../convex/services/jwt");
            const jwt = await ensureValidJwt();
            const api = getProtectedApi(jwt);
            await api.updateProject({ projectId, name: trimmed });
          })
            .then(() => {
              showSuccess(`Project renamed to "${trimmed}"`);
              setEditingProject(null);
              setEditProjectInput("");
              setEditProjectCursor(0);
              refetchProjects(); // Refresh the project list
            })
            .catch((err) => {
              console.error("Failed to rename project:", err);
            });
        } else {
          setEditingProject(null);
          setEditProjectInput("");
          setEditProjectCursor(0);
        }
        return;
      }

      // Arrow left with modifiers
      if (key.name === "left") {
        if (isOptionKey || key.option) {
          // Option+Left: Jump word backward
          let pos = editProjectCursor;
          while (pos > 0 && editProjectInput[pos - 1] === " ") pos--;
          while (pos > 0 && editProjectInput[pos - 1] !== " ") pos--;
          setEditProjectCursor(pos);
        } else if (key.meta) {
          // Cmd+Left: Jump to start
          setEditProjectCursor(0);
        } else {
          // Regular left
          setEditProjectCursor((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Arrow right with modifiers
      if (key.name === "right") {
        if (isOptionKey || key.option) {
          // Option+Right: Jump word forward
          let pos = editProjectCursor;
          while (pos < editProjectInput.length && editProjectInput[pos] !== " ") pos++;
          while (pos < editProjectInput.length && editProjectInput[pos] === " ") pos++;
          setEditProjectCursor(pos);
        } else if (key.meta) {
          // Cmd+Right: Jump to end
          setEditProjectCursor(editProjectInput.length);
        } else {
          // Regular right
          setEditProjectCursor((prev) => Math.min(editProjectInput.length, prev + 1));
        }
        return;
      }

      // Backspace with modifiers
      if (key.name === "backspace") {
        if (key.meta || key.option) {
          // Meta/Option+Backspace: Delete word backward
          if (editProjectCursor > 0) {
            let newPos = editProjectCursor;
            while (newPos > 0 && editProjectInput[newPos - 1] === " ") newPos--;
            while (newPos > 0 && editProjectInput[newPos - 1] !== " ") newPos--;
            setEditProjectInput(
              editProjectInput.slice(0, newPos) + editProjectInput.slice(editProjectCursor),
            );
            setEditProjectCursor(newPos);
          }
        } else {
          // Regular backspace: Delete one character
          if (editProjectCursor > 0) {
            setEditProjectInput(
              editProjectInput.slice(0, editProjectCursor - 1) +
                editProjectInput.slice(editProjectCursor),
            );
            setEditProjectCursor(editProjectCursor - 1);
          }
        }
        return;
      }

      // Delete key (forward delete)
      if (key.name === "delete") {
        if (editProjectCursor < editProjectInput.length) {
          setEditProjectInput(
            editProjectInput.slice(0, editProjectCursor) +
              editProjectInput.slice(editProjectCursor + 1),
          );
        }
        return;
      }

      // Ctrl+A: Jump to start
      if (key.name === "a" && key.ctrl) {
        setEditProjectCursor(0);
        return;
      }

      // Ctrl+E: Jump to end
      if (key.name === "e" && key.ctrl) {
        setEditProjectCursor(editProjectInput.length);
        return;
      }

      // Ctrl+U: Delete all
      if (key.name === "u" && key.ctrl) {
        setEditProjectInput("");
        setEditProjectCursor(0);
        return;
      }

      // Ctrl+W: Delete word backward
      if (key.name === "w" && key.ctrl) {
        if (editProjectCursor > 0) {
          let newPos = editProjectCursor;
          while (newPos > 0 && editProjectInput[newPos - 1] === " ") newPos--;
          while (newPos > 0 && editProjectInput[newPos - 1] !== " ") newPos--;
          setEditProjectInput(
            editProjectInput.slice(0, newPos) + editProjectInput.slice(editProjectCursor),
          );
          setEditProjectCursor(newPos);
        }
        return;
      }

      // Meta+B (Option+Left): Jump word backward
      if (key.name === "b" && key.meta) {
        let pos = editProjectCursor;
        while (pos > 0 && editProjectInput[pos - 1] === " ") pos--;
        while (pos > 0 && editProjectInput[pos - 1] !== " ") pos--;
        setEditProjectCursor(pos);
        return;
      }

      // Meta+F (Option+Right): Jump word forward
      if (key.name === "f" && key.meta) {
        let pos = editProjectCursor;
        while (pos < editProjectInput.length && editProjectInput[pos] !== " ") pos++;
        while (pos < editProjectInput.length && editProjectInput[pos] === " ") pos++;
        setEditProjectCursor(pos);
        return;
      }

      // Meta+D (Option+Delete): Delete word forward
      if (key.name === "d" && key.meta) {
        let endPos = editProjectCursor;
        while (endPos < editProjectInput.length && editProjectInput[endPos] === " ") endPos++;
        while (endPos < editProjectInput.length && editProjectInput[endPos] !== " ") endPos++;
        setEditProjectInput(
          editProjectInput.slice(0, editProjectCursor) + editProjectInput.slice(endPos),
        );
        return;
      }

      // Regular typing (30 char limit) - also handles Cmd+V paste
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const availableSpace = 30 - editProjectInput.length;
        const textToInsert = key.sequence.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setEditProjectInput(
            editProjectInput.slice(0, editProjectCursor) +
              textToInsert +
              editProjectInput.slice(editProjectCursor),
          );
          setEditProjectCursor(editProjectCursor + textToInsert.length);
        }
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

    if (activeModal === "password") {
      // PasswordForm handles its own keyboard
      if (key.name === "escape") {
        closeModal();
      }
      return;
    }

    if (activeModal === "commandPalette") {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "up" || key.name === "k") {
        setCommandPaletteIndex((prev) => (prev > 0 ? prev - 1 : getAllCommands().length - 1));
      } else if (key.name === "down" || key.name === "j") {
        setCommandPaletteIndex((prev) => (prev < getAllCommands().length - 1 ? prev + 1 : 0));
      } else if (key.name === "return") {
        const commands = getAllCommands();
        const cmd = commands[commandPaletteIndex];
        if (cmd) {
          closeModal();
          executeCommand(cmd.key);
        }
      } else if (key.name === "p") {
        closeModal();
        executeCommand("p");
      } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
        closeModal();
        executeCommand("^l");
      }
      return;
    }

    if (key.name === "k" || key.name === "up") {
      moveUp();
      setConfirmingDelete(null);
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
      setConfirmingDelete(null);
    } else if (key.name === "return") {
      selectProject();
    } else if (key.name === "d") {
      const project = projects[selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setConfirmingDelete({ id: project.id, name: project.name });
      }
    } else if (key.name === "n" && !confirmingDelete && !editingProject) {
      setCreatingProject(true);
      setNewProjectInput("");
      setNewProjectCursor(0);
    } else if (key.name === "u" && !confirmingDelete && !creatingProject) {
      // Rename project
      const project = projects[selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setEditingProject({ id: project.id, originalName: project.name });
        setEditProjectInput(project.name);
        setEditProjectCursor(project.name.length);
      }
    } else if (key.name === "p" && !confirmingDelete) {
      setActiveModal("password");
    } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setActiveModal("logout");
    } else if (key.sequence === "?") {
      setCommandPaletteIndex(0);
      setActiveModal("commandPalette");
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  useKeyboard((key) => {
    if (!confirmingDelete) return;

    if (key.name === "y") {
      const projectId = confirmingDelete.id;
      const projectName = confirmingDelete.name;
      runTask(`Archiving "${projectName}"...`, async () => {
        const { getProtectedApi } = await import("../../convex/api/protected");
        const { ensureValidJwt } = await import("../../convex/services/jwt");
        const jwt = await ensureValidJwt();
        const api = getProtectedApi(jwt);
        await api.archiveProject(projectId);
      })
        .then(() => {
          showSuccess(`"${projectName}" archived`);
          setConfirmingDelete(null);
          refetchProjects(); // Refresh the project list
        })
        .catch((err) => {
          console.error("Failed to archive project:", err);
        });
    } else if (key.name === "n" || key.name === "escape") {
      setConfirmingDelete(null);
    }
  });

  const getShortcutGroups = () => {
    if (creatingProject) {
      return {
        primary: [
          {
            shortcuts: [
              { key: "↵", description: "create" },
              { key: "esc", description: "cancel" },
            ],
          },
        ],
        secondary: [],
      };
    }
    if (editingProject) {
      return {
        primary: [
          {
            shortcuts: [
              { key: "↵", description: "save" },
              { key: "esc", description: "cancel" },
            ],
          },
        ],
        secondary: [],
      };
    }
    return {
      primary: [
        {
          shortcuts: [
            { key: "n", description: "create project" },
            { key: "u", description: "rename project" },
          ],
        },
      ],
      secondary: [],
    };
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
          backgroundColor={THEME_COLORS.header}
          width={56}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          <box height={1} marginBottom={1} justifyContent="center" alignItems="center">
            <text fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</text>
          </box>

          <box
            height={1}
            width={52}
            marginTop={1}
            marginBottom={1}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <text fg={THEME_COLORS.textMuted}>Projects</text>
            <text fg={THEME_COLORS.textDim}>
              {isLoadingProjects ? "..." : `${projects.length} / 10`}
            </text>
          </box>

          <box
            flexDirection="column"
            width={52}
            height={
              projects.length === 0 && !creatingProject
                ? 1
                : Math.min(
                    projects.length + (creatingProject ? 1 : 0) + (confirmingDelete ? 1 : 0),
                    PAGE_SIZE + (confirmingDelete ? 1 : 0),
                  )
            }
          >
            {projectsError ? (
              <box height={1}>
                <text fg={THEME_COLORS.error || "#ff0000"}>Failed to load projects</text>
              </box>
            ) : isLoadingProjects ? (
              <box height={1}>
                <text fg={THEME_COLORS.textDim}>Loading projects...</text>
              </box>
            ) : projects.length === 0 && !creatingProject ? (
              <box height={1}>
                <text fg={THEME_COLORS.textDim}>No projects yet. Press 'n' to create one.</text>
              </box>
            ) : (
              <>
                {projects.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((project, index) => {
                  const actualIndex = index + scrollOffset;
                  const isSelected =
                    actualIndex === selectedIndex && !creatingProject && !editingProject;
                  const statusColor = STATUS_COLORS[project.status];
                  const statusIcon = STATUS_ICONS[project.status];
                  const isEditing = editingProject?.id === project.id;

                  return (
                    <box key={project.id} flexDirection="column">
                      {isEditing ? (
                        <InlineInput
                          value={editProjectInput}
                          cursor={editProjectCursor}
                          cursorVisible={cursorVisible}
                          maxWidth={40}
                          maxLength={30}
                          width={52}
                          isFocused={true}
                          icon="[~]"
                          iconColor={THEME_COLORS.accent}
                        />
                      ) : (
                        <box
                          height={1}
                          width={52}
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
                            {isSelected && (
                              <span fg={THEME_COLORS.textDim}>[{project.status}] </span>
                            )}
                            <span fg={statusColor}>{statusIcon}</span>
                          </text>
                        </box>
                      )}
                      <DeleteConfirmation
                        itemType="project"
                        itemName={project.name}
                        visible={confirmingDelete?.id === project.id}
                      />
                    </box>
                  );
                })}
                {creatingProject &&
                  (() => {
                    const maxWidth = 28; // Visible text area width
                    const maxLength = 30;
                    const charCount = `${newProjectInput.length}/${maxLength}`;
                    const isEmpty = newProjectInput.length === 0;

                    // Calculate visible text with scrolling
                    let displayText = newProjectInput;
                    let displayCursor = newProjectCursor;
                    let scrollLeft = "";
                    let scrollRight = "";

                    if (newProjectInput.length > maxWidth) {
                      // Scroll to keep cursor visible
                      const padding = 3;
                      let start = 0;
                      if (newProjectCursor > maxWidth - padding) {
                        start = Math.min(
                          newProjectCursor - maxWidth + padding,
                          newProjectInput.length - maxWidth,
                        );
                      }
                      start = Math.max(0, start);
                      displayText = newProjectInput.slice(start, start + maxWidth);
                      displayCursor = newProjectCursor - start;
                      if (start > 0) scrollLeft = "◀ ";
                      if (start + maxWidth < newProjectInput.length) scrollRight = " ▶";
                    }

                    return (
                      <box height={1} width={52} flexDirection="row" justifyContent="space-between">
                        <text>
                          <span fg={THEME_COLORS.primary}>› </span>
                          <span fg={THEME_COLORS.success}>[+]</span>
                          <span fg={THEME_COLORS.text}> </span>
                          {isEmpty ? (
                            <>
                              {cursorVisible ? (
                                <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                                  {" "}
                                </span>
                              ) : (
                                <span> </span>
                              )}
                              <span fg={THEME_COLORS.textDim}>e.g. my-project</span>
                            </>
                          ) : (
                            <>
                              <span fg={THEME_COLORS.textDim}>{scrollLeft}</span>
                              <span fg={THEME_COLORS.text}>
                                {displayText.slice(0, displayCursor)}
                              </span>
                              {cursorVisible ? (
                                <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                                  {displayText[displayCursor] || " "}
                                </span>
                              ) : (
                                <span fg={THEME_COLORS.text}>
                                  {displayText[displayCursor] || " "}
                                </span>
                              )}
                              <span fg={THEME_COLORS.text}>
                                {displayText.slice(displayCursor + 1)}
                              </span>
                              <span fg={THEME_COLORS.textDim}>{scrollRight}</span>
                            </>
                          )}
                        </text>
                        <text fg={THEME_COLORS.textDim}>{charCount}</text>
                      </box>
                    );
                  })()}
              </>
            )}
          </box>

          {(activeModal === "none" || creatingProject || activeModal === "commandPalette") && (
            <box marginTop={1}>
              <GuideBar
                groups={getShortcutGroups()}
                customWidth={52}
                minimal={true}
                showHelp={!creatingProject}
              />
            </box>
          )}
        </box>
      </box>

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
        <box flexDirection="column" alignItems="flex-start">
          <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
        </box>
      </Modal>

      <ChangePasswordModal
        visible={activeModal === "password"}
        onClose={closeModal}
        onSuccess={(_newPassword: string) => {
          closeModal();
        }}
        verifyCurrentPassword={(_password: string) => {
          return true;
        }}
      />

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={getAllCommands()}
        selectedIndex={commandPaletteIndex}
        onClose={closeModal}
      />
    </box>
  );
}
