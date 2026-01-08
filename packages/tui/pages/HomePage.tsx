import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import { InlineInput } from "../components/forms/InlineInput";
import { ChangePasswordModal } from "../components/modals/ChangePasswordModal";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import { DeleteConfirmation } from "../components/shared/DeleteConfirmation";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import { useAppSession } from "../hooks/useAppSession";
import { useProjects } from "../hooks/useProjects";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type { ModalType, ProjectStatus } from "../types";
import { KEY_SYMBOLS, STATUS_COLORS, THEME_COLORS } from "../utils/constants";
import { logger } from "../utils/debugLog";

const STATUS_ICONS: Record<ProjectStatus, string> = {
  owned: "●",
  shared: "◉",
  archived: "○",
  restricted: "Ø",
};

const PAGE_SIZE = 5;

export function HomePage() {
  const { width, height } = useTerminalDimensions();
  const { navigate } = useRouter();
  const { logout } = useAppSession();
  const { runTask, showSuccess } = useTaskQueue();

  const {
    projects,
    isLoading: isLoadingProjects,
    limits,
    isLoadingLimits,
    refetch: refetchProjects,
  } = useProjects();

  const { publicKey, hasKeys, isLoading: isLoadingKeys } = useUserKeys();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [activeModal, setActiveModal] = useState<ModalType>("none");

  const [creatingProject, setCreatingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  const validatedEditingProject =
    editingProject && projects.some((p) => p.id === editingProject.id) ? editingProject : null;
  const validatedConfirmingDelete =
    confirmingDelete && projects.some((p) => p.id === confirmingDelete.id)
      ? confirmingDelete
      : null;

  useEffect(() => {
    if (!isLoadingProjects && projects.length > 0 && selectedIndex >= projects.length) {
      setSelectedIndex(0);
    }
  }, [isLoadingProjects, projects.length, selectedIndex]);

  const moveUp = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : projects.length - 1;
      if (next < scrollOffset) setScrollOffset(next);
      else if (next >= scrollOffset + PAGE_SIZE)
        setScrollOffset(Math.max(0, projects.length - PAGE_SIZE));
      return next;
    });
  };

  const moveDown = () => {
    if (projects.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev < projects.length - 1 ? prev + 1 : 0;
      if (next >= scrollOffset + PAGE_SIZE) setScrollOffset(next - PAGE_SIZE + 1);
      else if (next < scrollOffset) setScrollOffset(0);
      return next;
    });
  };

  const selectProject = (projectId: string, projectName: string, projectStatus: ProjectStatus) => {
    navigate({ name: "project", projectId, projectName, projectStatus });
  };

  const handleCreateProject = async (name: string) => {
    if (!hasKeys || !publicKey) {
      logger.error("Cannot create project: User has no keys");
      return;
    }

    try {
      await runTask(`Creating project "${name}"...`, async () => {
        const { createProjectKey } = await import("@repo/crypto");
        const { encryptedProjectKey } = await createProjectKey(publicKey);

        const { getProtectedApi } = await import("../convex/api/protected");
        const api = getProtectedApi();
        await api.createProject({ name, encryptedProjectKey });
      });
      showSuccess(`Project "${name}" created`);
      setCreatingProject(false);
      refetchProjects();
    } catch (err) {
      logger.error("Failed to create project:", err);
      throw err;
    }
  };

  const handleRenameProject = async (name: string) => {
    if (!editingProject || name === editingProject.name) {
      setEditingProject(null);
      return;
    }
    try {
      await runTask(`Renaming project to "${name}"...`, async () => {
        const { getProtectedApi } = await import("../convex/api/protected");
        const api = getProtectedApi();
        await api.updateProject({ projectId: editingProject.id, name });
      });
      showSuccess(`Project renamed to "${name}"`);
      setEditingProject(null);
      refetchProjects();
    } catch (err) {
      logger.error("Failed to rename project:", err);
    }
  };

  const handleArchiveProject = async () => {
    if (!confirmingDelete) return;
    try {
      await runTask(`Archiving "${confirmingDelete.name}"...`, async () => {
        const { getProtectedApi } = await import("../convex/api/protected");
        const api = getProtectedApi();
        await api.archiveProject(confirmingDelete.id);
      });
      showSuccess(`"${confirmingDelete.name}" archived`);
      setConfirmingDelete(null);
      refetchProjects();
    } catch (err) {
      logger.error("Failed to archive project:", err);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const commands = [
    { key: "n", description: "Create project", category: "Create" },
    { key: "u", description: "Rename project", category: "Manage" },
    { key: "p", description: "Change password", category: "Account" },
    { key: "^l", description: "Logout", category: "Account" },
  ].sort((a, b) => {
    const order = ["Navigate", "Create", "Manage", "View", "Account"];
    return order.indexOf(a.category) - order.indexOf(b.category);
  });

  const executeCommand = (cmd: { key: string }) => {
    switch (cmd.key) {
      case "n":
        if (!isLoadingKeys && hasKeys && publicKey) {
          setCreatingProject(true);
        }
        break;
      case "u": {
        const project = projects[selectedIndex];
        if (project && project.status !== "restricted" && project.status !== "archived") {
          setEditingProject({ id: project.id, name: project.name });
        }
        break;
      }
      case "p":
        setActiveModal("password");
        break;
      case "^l":
        setActiveModal("logout");
        break;
    }
  };

  useKeyboard((key) => {
    if (creatingProject || editingProject) return;

    if (activeModal === "logout") {
      if (key.name === "y") handleLogout();
      else if (key.name === "n" || key.name === "escape") setActiveModal("none");
      return;
    }

    if (activeModal === "password") {
      if (key.name === "escape") setActiveModal("none");
      return;
    }

    if (activeModal === "commandPalette") return;

    if (confirmingDelete) {
      if (key.name === "y") handleArchiveProject();
      else if (key.name === "n" || key.name === "escape") setConfirmingDelete(null);
      return;
    }

    if (key.name === "k" || key.name === "up") {
      moveUp();
      setConfirmingDelete(null);
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
      setConfirmingDelete(null);
    } else if (key.name === "return") {
      const project = projects[selectedIndex];
      if (project) selectProject(project.id, project.name, project.status);
    } else if (key.name === "d") {
      const project = projects[selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setConfirmingDelete({ id: project.id, name: project.name });
      }
    } else if (key.name === "n") {
      if (!isLoadingKeys && hasKeys && publicKey) {
        setCreatingProject(true);
      } else if (!isLoadingKeys && !hasKeys) {
        logger.error(
          "Cannot create project: User has no encryption keys. Please set up your password first.",
        );
      }
    } else if (key.name === "u") {
      const project = projects[selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setEditingProject({ id: project.id, name: project.name });
      }
    } else if (key.name === "p") {
      setActiveModal("password");
    } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setActiveModal("logout");
    } else if (key.sequence === "?") {
      setActiveModal("commandPalette");
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const getShortcuts = () => {
    if (creatingProject) {
      return {
        primary: [
          {
            shortcuts: [
              { key: KEY_SYMBOLS.enter, description: "create" },
              { key: "esc", description: "cancel" },
            ],
          },
        ],
        secondary: [],
      };
    }
    if (validatedEditingProject) {
      return {
        primary: [
          {
            shortcuts: [
              { key: KEY_SYMBOLS.enter, description: "save" },
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
              {isLoadingProjects || isLoadingLimits
                ? "..."
                : limits !== null && limits.included_usage !== undefined
                  ? `${limits.usage} / ${limits.included_usage}`
                  : `${projects.length}`}
            </text>
          </box>

          <box
            flexDirection="column"
            width={52}
            height={
              projects.length === 0 && !creatingProject
                ? 1
                : Math.min(
                    projects.length +
                      (creatingProject ? 1 : 0) +
                      (validatedConfirmingDelete ? 1 : 0),
                    PAGE_SIZE + (validatedConfirmingDelete ? 1 : 0),
                  )
            }
          >
            {isLoadingProjects ? (
              <text fg={THEME_COLORS.textDim}>Loading projects...</text>
            ) : projects.length === 0 && !creatingProject ? (
              <text fg={THEME_COLORS.textDim}>No projects created. Press 'n' to create one.</text>
            ) : (
              <>
                {projects.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((project, index) => {
                  const actualIndex = index + scrollOffset;
                  const isSelected =
                    actualIndex === selectedIndex && !creatingProject && !validatedEditingProject;
                  const isEditing =
                    validatedEditingProject !== null && validatedEditingProject?.id === project.id;
                  const isDeleting =
                    validatedConfirmingDelete !== null &&
                    validatedConfirmingDelete?.id === project.id;

                  return (
                    <box key={project.id} flexDirection="column">
                      {isEditing ? (
                        <InlineInput
                          active={true}
                          initialValue={project.name}
                          onSubmit={handleRenameProject}
                          onCancel={() => setEditingProject(null)}
                          maxWidth={40}
                          maxLength={30}
                          width={52}
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
                            <span fg={STATUS_COLORS[project.status]}>
                              {STATUS_ICONS[project.status]}
                            </span>
                          </text>
                        </box>
                      )}
                      <DeleteConfirmation
                        itemType="project"
                        itemName={project.name}
                        visible={isDeleting}
                      />
                    </box>
                  );
                })}
                {creatingProject && (
                  <InlineInput
                    active={true}
                    onSubmit={handleCreateProject}
                    onCancel={() => setCreatingProject(false)}
                    maxWidth={28}
                    maxLength={30}
                    width={52}
                    placeholder="e.g. my-project"
                    icon="[+]"
                    iconColor={THEME_COLORS.success}
                  />
                )}
              </>
            )}
          </box>

          {(activeModal === "none" || creatingProject || activeModal === "commandPalette") && (
            <box marginTop={1}>
              <GuideBar
                groups={getShortcuts()}
                customWidth={52}
                minimal={true}
                showHelp={!creatingProject && !validatedEditingProject}
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
        <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
      </Modal>

      <ChangePasswordModal
        visible={activeModal === "password"}
        onClose={() => setActiveModal("none")}
        onSuccess={() => setActiveModal("none")}
        verifyCurrentPassword={() => true}
      />

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={commands}
        onExecute={executeCommand}
        onClose={() => setActiveModal("none")}
      />
    </box>
  );
}
