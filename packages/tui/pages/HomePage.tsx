import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { createProjectKey } from "@repo/crypto";
import open from "open";
import { useEffect, useRef, useState } from "react";
import { getProtectedApi } from "../api";
import { InlineInput } from "../components/forms/InlineInput";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import { ConfirmPaymentModal } from "../components/modals/ConfirmPaymentModal";
import { BillingPortalModal, CheckoutRedirectModal } from "../components/modals/UrlOpenModal";
import { PasswordInput } from "../components/PasswordInput";
import { DeleteConfirmation } from "../components/shared/DeleteConfirmation";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { useUser } from "../context";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import { useAppSession } from "../hooks/useAppSession";
import { useListNavigation } from "../hooks/useListNavigation";
import { useLoadingState } from "../hooks/useLoadingState";
import { usePaymentFlow } from "../hooks/usePaymentFlow";
import { useProjects } from "../hooks/useProjects";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type { ModalType, ProjectStatus } from "../types/models";
import {
  DASHBOARD_URL,
  KEY_SYMBOLS,
  SPINNER_FRAMES,
  SPINNER_INTERVAL,
  STATUS_COLORS,
  THEME_COLORS,
} from "../utils/constants";
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
  const { runTask, continueTask, cancelTask, showSuccess, isProcessing } = useTaskQueue();
  const { hasPro, isLoading: isLoadingPlan } = useUser();

  const {
    projects,
    isLoading: isLoadingProjects,
    limits,
    refetch: refetchProjects,
  } = useProjects();

  const { publicKey, hasKeys, isLoading: isLoadingKeys } = useUserKeys();

  const navigation = useListNavigation({
    items: projects,
    pageSize: PAGE_SIZE,
    onSelect: (index) => {
      const project = projects[index];
      if (project)
        navigate({
          name: "project",
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
        });
    },
  });

  const payment = usePaymentFlow();
  const loading = useLoadingState(["creating", "renaming", "archiving"] as const);

  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [creatingProject, setCreatingProject] = useState(false);
  const [pendingProjectName, setPendingProjectName] = useState<string | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  useEffect(() => {
    if (!pendingProjectName) return;
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);
    return () => clearInterval(interval);
  }, [pendingProjectName]);

  const validatedEditingProject =
    editingProject && projects.some((p) => p.id === editingProject.id) ? editingProject : null;
  const validatedConfirmingDelete =
    confirmingDelete && projects.some((p) => p.id === confirmingDelete.id)
      ? confirmingDelete
      : null;

  const showPendingProject =
    pendingProjectName && !projects.some((p) => p.name === pendingProjectName);

  const prevHasProRef = useRef(hasPro);
  useEffect(() => {
    if (hasPro && !prevHasProRef.current) {
      refetchProjects();
      payment.closeAll();
      showSuccess("You're now a PRO! Unlimited projects unlocked.", 5000);
    }
    prevHasProRef.current = hasPro;
  }, [hasPro, refetchProjects, payment, showSuccess]);

  const handleCreateProject = async (name: string, confirmPayment?: boolean) => {
    if (!hasKeys || !publicKey) {
      logger.error("Cannot create project: User has no keys");
      return;
    }

    await loading.run("creating", async () => {
      setCreatingProject(false);
      setPendingProjectName(name);

      try {
        if (confirmPayment) {
          const result = await continueTask(async () => {
            const { encryptedProjectKey } = await createProjectKey(publicKey);
            const api = getProtectedApi();
            return await api.createProject({ name, encryptedProjectKey, confirmPayment: true });
          });

          if (!result) {
            setPendingProjectName(null);
            payment.closeConfirmation();
            return;
          }

          payment.handleResult(result, "project", name);
          if (result.status === "success") {
            await refetchProjects();
          } else {
            setPendingProjectName(null);
          }
          return;
        }

        const result = await runTask(`Creating project "${name}"...`, async () => {
          const { encryptedProjectKey } = await createProjectKey(publicKey);
          const api = getProtectedApi();
          return await api.createProject({ name, encryptedProjectKey, confirmPayment: false });
        });

        if (!result) {
          setPendingProjectName(null);
          return;
        }

        payment.handleResult(result, "project", name);
        if (result.status === "success") {
          await refetchProjects();
        } else {
          setPendingProjectName(null);
        }
      } catch {
        setPendingProjectName(null);
      }
    });
  };

  const handleConfirmPayment = async () => {
    if (payment.confirmationModal.itemName) {
      await handleCreateProject(payment.confirmationModal.itemName, true);
    }
  };

  const handleRenameProject = async (name: string, projectId: string) => {
    if (!projectId) {
      setEditingProject(null);
      return;
    }
    const currentProject = projects.find((p) => p.id === projectId);
    if (currentProject && name === currentProject.name) {
      setEditingProject(null);
      return;
    }
    await loading.run("renaming", async () => {
      await runTask(`Renaming project to "${name}"...`, async () => {
        const api = getProtectedApi();
        await api.updateProject({ projectId, name });
      });
      showSuccess(`Project renamed to "${name}"`);
      setEditingProject(null);
    });
  };

  const handleArchiveProject = async () => {
    if (!confirmingDelete) return;
    await loading.run("archiving", async () => {
      await runTask(`Archiving "${confirmingDelete.name}"...`, async () => {
        const api = getProtectedApi();
        await api.archiveProject(confirmingDelete.id);
      });
      showSuccess(`"${confirmingDelete.name}" archived`);
      setConfirmingDelete(null);
      await refetchProjects();
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  const commands = [
    { key: "n", description: "Create project", category: "Create" },
    { key: "u", description: "Rename project", category: "Manage" },
    { key: "d", description: "Delete project", category: "Manage" },
    { key: "p", description: "Change password", category: "Account" },
    { key: "^l", description: "Logout", category: "Account" },
  ];

  const executeCommand = (cmd: { key: string }) => {
    const project = projects[navigation.selectedIndex];
    const canModify = project && project.status !== "restricted" && project.status !== "archived";

    switch (cmd.key) {
      case "n":
        if (!isLoadingKeys && hasKeys && publicKey) setCreatingProject(true);
        break;
      case "u":
        if (canModify && project.id) setEditingProject({ id: project.id, name: project.name });
        break;
      case "d":
        if (canModify) setConfirmingDelete({ id: project.id, name: project.name });
        break;
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
    if (
      payment.confirmationModal.visible ||
      payment.checkoutModal.visible ||
      payment.billingPortalModal.visible
    )
      return;
    if (isProcessing || loading.anyLoading()) return;

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
      navigation.moveUp();
      setConfirmingDelete(null);
    } else if (key.name === "j" || key.name === "down") {
      navigation.moveDown();
      setConfirmingDelete(null);
    } else if (key.name === "return") {
      navigation.select();
    } else if (key.name === "d") {
      const project = projects[navigation.selectedIndex];
      if (project && project.status !== "restricted" && project.status !== "archived") {
        setConfirmingDelete({ id: project.id, name: project.name });
      }
    } else if (key.name === "n") {
      if (!isLoadingKeys && hasKeys && publicKey) {
        setCreatingProject(true);
      }
    } else if (key.name === "u") {
      const project = projects[navigation.selectedIndex];
      if (
        project &&
        project.status !== "restricted" &&
        project.status !== "archived" &&
        project.id
      ) {
        setEditingProject({ id: project.id, name: project.name });
      }
    } else if (key.name === "p") {
      setActiveModal("password");
    } else if (key.name === "g" && !key.meta && !key.ctrl) {
      open(DASHBOARD_URL);
    } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setActiveModal("logout");
    } else if (key.sequence === "?") {
      setActiveModal("commandPalette");
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const getShortcuts = () => {
    const isDisabled = isProcessing || loading.anyLoading();

    if (creatingProject) {
      return {
        primary: [
          {
            shortcuts: [
              { key: KEY_SYMBOLS.enter, description: "create", disabled: isDisabled },
              { key: "esc", description: "cancel", disabled: isDisabled },
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
              { key: KEY_SYMBOLS.enter, description: "save", disabled: isDisabled },
              { key: "esc", description: "cancel", disabled: isDisabled },
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
            { key: "n", description: "create project", disabled: isDisabled },
            { key: "u", description: "rename project", disabled: isDisabled },
            { key: "d", description: "delete project", disabled: isDisabled },
            { key: "g", description: "dashboard", disabled: isDisabled },
          ],
        },
      ],
      secondary: [
        {
          shortcuts: [
            { key: "p", description: "change password", disabled: isDisabled },
            { key: "^l", description: "logout", disabled: isDisabled },
          ],
        },
      ],
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
            <text>
              <span fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</span>
              <span fg={THEME_COLORS.textDim}> · </span>
              {isLoadingPlan ? (
                <span fg={THEME_COLORS.textDim}>...</span>
              ) : hasPro ? (
                <span fg={THEME_COLORS.success}>PRO</span>
              ) : (
                <span fg={THEME_COLORS.textDim}>FREE</span>
              )}
            </text>
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
            {(() => {
              if (isLoadingProjects) {
                return <text fg={THEME_COLORS.textDim}>...</text>;
              }

              if (limits !== null && limits.includedUsage !== undefined) {
                const totalProjects = limits.usage;
                const freeLimit = limits.includedUsage;
                const remainingFree = Math.max(0, freeLimit - totalProjects);

                if (remainingFree === 0) {
                  return (
                    <text fg={THEME_COLORS.textDim}>
                      {totalProjects} project{totalProjects !== 1 ? "s" : ""}
                    </text>
                  );
                }

                return (
                  <text>
                    <span fg={THEME_COLORS.textDim}>
                      {totalProjects} project{totalProjects !== 1 ? "s" : ""}{" "}
                    </span>
                    <span fg={THEME_COLORS.textDim}>(</span>
                    <span fg={THEME_COLORS.success}>{remainingFree} free</span>
                    <span fg={THEME_COLORS.textDim}>)</span>
                  </text>
                );
              }

              return <text fg={THEME_COLORS.textDim}>{projects.length}</text>;
            })()}
          </box>

          <box
            flexDirection="column"
            width={52}
            height={
              isLoadingProjects ||
              (projects.length === 0 && !creatingProject && !showPendingProject)
                ? 1
                : Math.min(
                    projects.length +
                      (creatingProject ? 1 : 0) +
                      (showPendingProject ? 1 : 0) +
                      (validatedConfirmingDelete ? 1 : 0),
                    PAGE_SIZE + (validatedConfirmingDelete ? 1 : 0) + (showPendingProject ? 1 : 0),
                  ) +
                  (navigation.hasMore.above ? 1 : 0) +
                  (navigation.hasMore.below ? 1 : 0)
            }
          >
            {isLoadingProjects ? (
              <text fg={THEME_COLORS.textDim}>Loading projects...</text>
            ) : projects.length === 0 && !creatingProject && !showPendingProject ? (
              <text fg={THEME_COLORS.textDim}>No projects created. Press 'n' to create one.</text>
            ) : (
              <>
                {navigation.hasMore.above && (
                  <text fg={THEME_COLORS.textDim}>
                    {"  "}... {navigation.hasMore.aboveCount} more item
                    {navigation.hasMore.aboveCount > 1 ? "s" : ""} above
                  </text>
                )}
                {navigation.visibleItems.map((project, index) => {
                  const actualIndex = index + navigation.scrollOffset;
                  const isSelected =
                    actualIndex === navigation.selectedIndex &&
                    !creatingProject &&
                    !validatedEditingProject;
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
                          onSubmit={(name) => {
                            if (project.id) handleRenameProject(name, project.id);
                          }}
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
                            <span fg={STATUS_COLORS[project.status] || THEME_COLORS.text}>
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
                {/* Show pending project in the list with spinner */}
                {showPendingProject && (
                  <box
                    height={1}
                    width={52}
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <text fg={THEME_COLORS.textMuted}>
                      <span fg={THEME_COLORS.primary}>{SPINNER_FRAMES[spinnerFrame]} </span>
                      {pendingProjectName}
                    </text>
                    <text fg={THEME_COLORS.textDim}>(creating...)</text>
                  </box>
                )}
                {navigation.hasMore.below && (
                  <text fg={THEME_COLORS.textDim}>
                    {"  "}... {navigation.hasMore.belowCount} more item
                    {navigation.hasMore.belowCount > 1 ? "s" : ""} below
                  </text>
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
          { key: "y", description: "yes", disabled: isProcessing },
          { key: "n", description: "no", disabled: isProcessing },
        ]}
      >
        <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
      </Modal>

      <Modal
        visible={activeModal === "password"}
        title="Change Password"
        width={55}
        height={16}
        shortcuts={[
          { key: "^v", description: "show/hide", disabled: false },
          { key: "tab", description: "next field", disabled: false },
          { key: "enter", description: "save", disabled: false },
          { key: "esc", description: "cancel", disabled: false },
        ]}
      >
        <PasswordInput
          mode="change"
          onSubmit={(_current, newPass) => {
            if (newPass) {
              setActiveModal("none");
            }
          }}
          onCancel={() => setActiveModal("none")}
          width={51}
        />
      </Modal>

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={commands}
        onExecute={executeCommand}
        onClose={() => setActiveModal("none")}
      />

      <CheckoutRedirectModal
        visible={payment.checkoutModal.visible}
        checkoutUrl={payment.checkoutModal.url}
        reason={payment.checkoutModal.reason}
        onClose={payment.closeCheckout}
      />

      <ConfirmPaymentModal
        visible={payment.confirmationModal.visible}
        type={payment.confirmationModal.type}
        itemName={payment.confirmationModal.itemName}
        balance={payment.confirmationModal.balance}
        onConfirm={handleConfirmPayment}
        onCancel={() => {
          cancelTask();
          payment.closeConfirmation();
        }}
      />

      <BillingPortalModal
        visible={payment.billingPortalModal.visible}
        portalUrl={payment.billingPortalModal.url}
        onClose={payment.closeBilling}
      />
    </box>
  );
}
