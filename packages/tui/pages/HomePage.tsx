/** @jsxImportSource @opentui/react */
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { createProjectKey } from "@repo/crypto";
import { createLogger, trackEvent } from "@repo/logger";
import open from "open";
import { useCallback, useEffect, useState } from "react";
import { ProjectCount, ProjectList } from "../components/home/ProjectList";
import { CheckoutRedirectModal } from "../components/modals/CheckoutRedirectModal";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import { ConfirmPaymentModal } from "../components/modals/ConfirmPaymentModal";
import { ProWelcomeModal } from "../components/modals/ProWelcomeModal";
import { PasswordInput } from "../components/PasswordInput";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { useUser } from "../context";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import { useAppSession } from "../hooks/useAppSession";
import { useChangePassword } from "../hooks/useChangePassword";
import { useListNavigation } from "../hooks/useListNavigation";
import { useLoadingState } from "../hooks/useLoadingState";
import { usePaymentFlow } from "../hooks/usePaymentFlow";
import { useProjects } from "../hooks/useProjects";
import { useProUpgradeNotice } from "../hooks/useProUpgradeNotice";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type { ModalType } from "../types/models";
import { DASHBOARD_URL, KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";

const logger = createLogger("tui");

const PAGE_SIZE = 5;

const COMMANDS = [
  { key: "n", description: "Create project", category: "Create" },
  { key: "u", description: "Rename project", category: "Manage" },
  { key: "d", description: "Delete project", category: "Manage" },
  { key: "p", description: "Change password", category: "Account" },
  { key: "^l", description: "Logout", category: "Account" },
];

export function HomePage() {
  useEffect(() => {
    trackEvent("tui_page_viewed", { page: "home" });
  }, []);
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const { navigate } = useRouter();
  const { logout } = useAppSession();
  const { runTask, attemptTask, continueTask, cancelTask, showSuccess, showError, isProcessing } =
    useTaskQueue();
  const { hasPro, isLoading: isLoadingPlan } = useUser();

  const {
    archivedCount,
    projects,
    isLoading: isLoadingProjects,
    limits,
    error: limitsError,
    refetch: refetchProjects,
    createProject,
    renameProject,
    archiveProject,
  } = useProjects();

  const {
    publicKey,
    hasKeys,
    isLoading: isLoadingKeys,
    encryptedPrivateKey,
    salt,
    updatePassword,
  } = useUserKeys();

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
  const proNotice = useProUpgradeNotice(() => {
    payment.closeAll();
    refetchProjects();
  });

  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [creatingProject, setCreatingProject] = useState(false);
  const [pendingProjectName, setPendingProjectName] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  const closeModal = useCallback(() => setActiveModal("none"), []);
  const passwordChange = useChangePassword({
    encryptedPrivateKey,
    salt,
    updatePassword,
    onChanged: () => {
      closeModal();
      showSuccess("Password changed successfully");
    },
  });

  const pendingProjectCreated =
    pendingProjectName !== null && projects.some((p) => p.name === pendingProjectName);
  useEffect(() => {
    if (pendingProjectCreated) setPendingProjectName(null);
  }, [pendingProjectCreated]);

  const validatedEditingProject =
    editingProject && projects.some((p) => p.id === editingProject.id) ? editingProject : null;
  const validatedConfirmingDelete =
    confirmingDelete && projects.some((p) => p.id === confirmingDelete.id)
      ? confirmingDelete
      : null;

  const showSetupRequiredError = useCallback(() => {
    showError(
      hasKeys
        ? "Unlock your master password to continue."
        : "Create a master password first to generate your encryption keys.",
    );
  }, [hasKeys, showError]);

  const handleCreateProject = async (name: string, confirmPayment = false) => {
    if (!hasKeys || !publicKey) {
      logger.error("Cannot create project: User has no keys");
      showSetupRequiredError();
      return;
    }

    await loading.run("creating", async () => {
      setCreatingProject(false);
      setPendingProjectName(name);

      const create = async () => {
        const { encryptedProjectKey } = await createProjectKey(publicKey);
        return await createProject(name, encryptedProjectKey, confirmPayment);
      };
      const result = confirmPayment
        ? await continueTask(create)
        : await runTask(`Creating project "${name}"...`, create);

      if (!result) {
        trackEvent("project_created", { success: false });
        setPendingProjectName(null);
        if (confirmPayment) payment.closeConfirmation();
        return;
      }

      if (payment.handleResult(result, "project", name) === "success") {
        trackEvent("project_created", { success: true, confirmed_payment: confirmPayment });
      } else {
        setPendingProjectName(null);
      }
    });
  };

  const handleRenameProject = async (name: string, projectId: string) => {
    const currentProject = projects.find((p) => p.id === projectId);
    if (!currentProject || name === currentProject.name) {
      setEditingProject(null);
      return;
    }
    await loading.run("renaming", async () => {
      const renamed = await attemptTask(`Renaming project to "${name}"...`, () =>
        renameProject(projectId, name),
      );
      trackEvent("project_renamed", { success: renamed });
      if (renamed) showSuccess(`Project renamed to "${name}"`);
      setEditingProject(null);
    });
  };

  const handleArchiveProject = async () => {
    if (!confirmingDelete) return;
    const { id, name } = confirmingDelete;
    await loading.run("archiving", async () => {
      const archived = await attemptTask(`Archiving "${name}"...`, () => archiveProject(id));
      trackEvent("project_archived", { success: archived });
      if (archived) showSuccess(`"${name}" archived`);
      setConfirmingDelete(null);
    });
  };

  const selectedProject = projects[navigation.selectedIndex];

  const startCreate = () => {
    if (isLoadingKeys) return;
    if (hasKeys && publicKey) setCreatingProject(true);
    else showSetupRequiredError();
  };

  const requireOwnedProject = (action: string, onOwned: (id: string, name: string) => void) => {
    if (!selectedProject) return;
    if (selectedProject.status === "owned") {
      onOwned(selectedProject.id, selectedProject.name);
    } else if (selectedProject.status === "shared") {
      showError(`Only project owners can ${action} projects`);
    }
  };

  const startRename = () =>
    requireOwnedProject("rename", (id, name) => setEditingProject({ id, name }));

  const startArchive = () =>
    requireOwnedProject("delete", (id, name) => setConfirmingDelete({ id, name }));

  const executeCommand = (cmd: { key: string }) => {
    switch (cmd.key) {
      case "n":
        startCreate();
        break;
      case "u":
        startRename();
        break;
      case "d":
        startArchive();
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
    if (proNotice.visible) return;
    if (creatingProject || editingProject) return;
    if (payment.isModalOpen) return;
    if (isProcessing || loading.anyLoading()) return;

    if (activeModal === "logout") {
      if (key.name === "y") logout();
      else if (key.name === "n" || key.name === "escape") closeModal();
      return;
    }

    if (activeModal === "password") {
      if (key.name === "escape" && !passwordChange.isChanging) {
        closeModal();
        passwordChange.reset();
      }
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
      startArchive();
    } else if (key.name === "n") {
      startCreate();
    } else if (key.name === "u") {
      startRename();
    } else if (key.name === "p") {
      setActiveModal("password");
    } else if (key.name === "g" && !key.meta && !key.ctrl) {
      trackEvent("tui_open_dashboard");
      open(DASHBOARD_URL);
    } else if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setActiveModal("logout");
    } else if (key.sequence === "?") {
      setActiveModal("commandPalette");
    } else if (key.name === "q") {
      renderer.destroy();
    }
  });

  const getShortcuts = () => {
    const isDisabled = isProcessing || loading.anyLoading();

    if (creatingProject || validatedEditingProject) {
      return {
        primary: [
          {
            shortcuts: [
              {
                key: KEY_SYMBOLS.enter,
                description: creatingProject ? "create" : "save",
                disabled: isDisabled,
              },
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
            { key: "g", description: "open dashboard", disabled: isDisabled },
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
      height={height - 1}
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
              <span fg={THEME_COLORS.textMuted}>The secrets layer</span>
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
            <ProjectCount
              isLoading={isLoadingProjects}
              hasError={limitsError !== null}
              projectCount={projects.length}
              limits={limits}
            />
          </box>

          <ProjectList
            projects={projects}
            isLoading={isLoadingProjects}
            archivedCount={archivedCount}
            pageSize={PAGE_SIZE}
            navigation={navigation}
            isCreating={creatingProject}
            editingProject={validatedEditingProject}
            confirmingDelete={validatedConfirmingDelete}
            pendingProjectName={pendingProjectCreated ? null : pendingProjectName}
            onCreate={(name) => handleCreateProject(name)}
            onCancelCreate={() => setCreatingProject(false)}
            onRename={handleRenameProject}
            onCancelRename={() => setEditingProject(null)}
          />

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

      {/* NOTE: shortcuts={[]} because PasswordInput has its own GuideBar with contextual labels */}
      <Modal
        visible={activeModal === "password"}
        title="Change Password"
        width={55}
        height={18}
        shortcuts={[]}
      >
        <PasswordInput
          mode="change"
          onSubmit={(currentPass, newPass) => {
            if (currentPass && newPass) {
              passwordChange.changePassword(currentPass, newPass);
            }
          }}
          onCancel={() => {
            closeModal();
            passwordChange.reset();
          }}
          additionalShortcuts={[
            { key: "esc", description: "cancel", disabled: passwordChange.isChanging },
          ]}
          width={51}
          disabled={passwordChange.isChanging}
          error={passwordChange.error}
        />
      </Modal>

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={COMMANDS}
        onExecute={executeCommand}
        onClose={closeModal}
      />

      <CheckoutRedirectModal checkoutUrl={payment.checkoutUrl} onClose={payment.closeCheckout} />

      <ProWelcomeModal visible={proNotice.visible} onClose={proNotice.dismiss} />

      <ConfirmPaymentModal
        visible={payment.confirmationModal.visible}
        type={payment.confirmationModal.type}
        itemName={payment.confirmationModal.itemName}
        balance={payment.confirmationModal.balance}
        onConfirm={() => {
          const { itemName } = payment.confirmationModal;
          if (itemName) handleCreateProject(itemName, true);
        }}
        onCancel={() => {
          cancelTask();
          payment.closeConfirmation();
        }}
      />
    </box>
  );
}
