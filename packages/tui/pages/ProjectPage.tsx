/** @jsxImportSource @opentui/react */
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { trackEvent } from "@repo/logger";
import open from "open";
import { useEffect, useState } from "react";
import { BulkImportModal } from "../components/modals/BulkImportModal";
import { CheckoutRedirectModal } from "../components/modals/CheckoutRedirectModal";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import { ConfirmPaymentModal } from "../components/modals/ConfirmPaymentModal";
import { ManageCollaboratorsModal } from "../components/modals/ManageCollaboratorsModal";
import { ProWelcomeModal } from "../components/modals/ProWelcomeModal";
import { PasswordInput } from "../components/PasswordInput";
import { ProjectItemList } from "../components/project/ProjectItemList";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { useBulkImport } from "../hooks/useBulkImport";
import { useCollaboratorActions } from "../hooks/useCollaboratorActions";
import { useListNavigation } from "../hooks/useListNavigation";
import { useProjectItemActions } from "../hooks/useProjectItemActions";
import { useProjectPage } from "../hooks/useProjectPage";
import { useProUpgradeNotice } from "../hooks/useProUpgradeNotice";
import { useSessionUnlock } from "../hooks/useSessionUnlock";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type { ModalType, ProjectStatus, ViewLevel } from "../types/models";
import { DASHBOARD_URL, KEY_SYMBOLS, STATUS_COLORS, THEME_COLORS } from "../utils/constants";
import { buildProjectItems, type ProjectItem, secretsInView } from "../utils/projectItems";

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
}

const PAGE_SIZE = 10;
const COMMAND_CATEGORIES = ["Navigate", "Create", "Manage", "View"];

type SecretItem = Extract<ProjectItem, { type: "secret" }>;

export function ProjectPage({ projectId, projectName, projectStatus }: ProjectPageProps) {
  useEffect(() => {
    trackEvent("tui_page_viewed", { page: "project" });
  }, []);
  const { width, height } = useTerminalDimensions();
  const { goBack: routerGoBack } = useRouter();
  const { isProcessing } = useTaskQueue();

  const {
    environments,
    folders,
    secrets,
    sharedUsers,
    shareLimits,
    loadEnvironment,
    createEnv,
    updateEnv,
    removeEnv,
    createFolder,
    updateFolder,
    deleteFolder,
    updateSecretBulk,
    deleteSecret,
    shareProject,
    revokeShare,
    revokeShareWithRotation,
    refetchProject,
  } = useProjectPage(projectId);

  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const closeModal = () => setActiveModal("none");

  const isRestricted = projectStatus === "restricted" || projectStatus === "archived";
  const location = { viewLevel, environmentId: selectedEnvId, folderId: selectedFolderId };
  const items = buildProjectItems(location, environments, folders, secrets);
  const selectedEnv = environments.find((e) => e.id === selectedEnvId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const navigation = useListNavigation({
    items,
    pageSize: PAGE_SIZE,
    onSelect: async (index) => {
      const item = items[index];
      if (item?.type === "env") {
        setSelectedEnvId(item.id);
        setViewLevel("environment");
        navigation.reset();
        await loadEnvironment(item.id);
      } else if (item?.type === "folder") {
        setSelectedFolderId(item.id);
        setViewLevel("folder");
        navigation.reset();
      }
    },
  });
  const selectedItem = items[navigation.selectedIndex];

  const goBack = () => {
    if (viewLevel === "folder") {
      setSelectedFolderId(null);
      setViewLevel("environment");
    } else if (viewLevel === "environment") {
      setSelectedEnvId(null);
      setViewLevel("environments");
    } else {
      routerGoBack();
    }
    navigation.reset();
  };

  const itemActions = useProjectItemActions({
    selectedEnvId,
    createEnvironment: createEnv,
    createFolder,
    updateEnvironment: updateEnv,
    updateFolder,
    deleteEnvironment: removeEnv,
    deleteFolder,
    deleteSecret,
    onDeleted: (item) => {
      if (item.type === "env" && selectedEnvId === item.id) {
        setSelectedEnvId(null);
        setViewLevel("environments");
      } else if (item.type === "folder" && selectedFolderId === item.id) {
        setSelectedFolderId(null);
        setViewLevel("environment");
      }
    },
  });
  const { creatingItem, editingItem, confirmingDelete } = itemActions;

  const collaborators = useCollaboratorActions({
    shareProject,
    revokeShare,
    revokeShareWithRotation,
    onChanged: refetchProject,
  });
  const { payment } = collaborators;

  const proNotice = useProUpgradeNotice(() => {
    refetchProject();
    payment.closeAll();
  });

  const unlock = useSessionUnlock();

  const bulkImport = useBulkImport({
    visible: activeModal === "bulkImport",
    location,
    allSecrets: secrets,
    onClose: closeModal,
    updateSecretBulk,
    deleteSecret,
  });

  const openEditor = () =>
    unlock.requireUnlock(() => {
      bulkImport.open(items.filter((i): i is SecretItem => i.type === "secret"));
      setActiveModal("bulkImport");
    });

  const toggleSecrets = () => {
    if (showSecrets) setShowSecrets(false);
    else unlock.requireUnlock(() => setShowSecrets(true));
  };

  const startCreate = () => {
    if (viewLevel === "environments") itemActions.setCreatingItem("env");
    else if (viewLevel === "environment") itemActions.setCreatingItem("folder");
  };

  const startRename = () => {
    if (selectedItem?.type === "env" || selectedItem?.type === "folder") {
      itemActions.setEditingItem({
        type: selectedItem.type,
        id: selectedItem.id,
        name: selectedItem.name,
      });
    }
  };

  const startDelete = () => {
    if (selectedItem) {
      itemActions.setConfirmingDelete({
        type: selectedItem.type,
        id: selectedItem.id,
        name: selectedItem.name,
      });
    }
  };

  const getAllCommands = () => {
    const cmds: Array<{ key: string; description: string; category: string; disabled?: boolean }> =
      [];
    if (viewLevel === "environments") {
      cmds.push(
        { key: "n", description: "Create environment", category: "Create", disabled: isRestricted },
        { key: "u", description: "Rename environment", category: "Manage", disabled: isRestricted },
        { key: "d", description: "Delete environment", category: "Manage", disabled: isRestricted },
        { key: "g", description: "Open dashboard", category: "Navigate" },
        { key: "esc", description: "Back to home", category: "Navigate" },
      );
    } else {
      if (viewLevel === "environment") {
        cmds.push({
          key: "n",
          description: "Create folder",
          category: "Create",
          disabled: isRestricted,
        });
        if (selectedItem?.type === "folder") {
          cmds.push({
            key: "u",
            description: "Rename folder",
            category: "Manage",
            disabled: isRestricted,
          });
        }
      }
      cmds.push(
        { key: "⌥i", description: "Edit secrets", category: "Manage", disabled: isRestricted },
        {
          key: "d",
          description: viewLevel === "environment" ? "Delete" : "Delete secret",
          category: "Manage",
          disabled: isRestricted,
        },
        { key: "g", description: "Open dashboard", category: "Navigate" },
        { key: "esc", description: "Go back", category: "Navigate" },
        { key: "v", description: showSecrets ? "Hide secrets" : "Show secrets", category: "View" },
      );
    }
    cmds.push({
      key: "c",
      description: "Manage collaborators",
      category: "Manage",
      disabled: isRestricted,
    });
    return cmds.sort(
      (a, b) => COMMAND_CATEGORIES.indexOf(a.category) - COMMAND_CATEGORIES.indexOf(b.category),
    );
  };

  const executeCommand = (cmd: { key: string }) => {
    if (isRestricted && ["n", "u", "d", "c", "⌥i"].includes(cmd.key)) return;
    switch (cmd.key) {
      case "n":
        startCreate();
        break;
      case "u":
        startRename();
        break;
      case "d":
        startDelete();
        break;
      case "esc":
        goBack();
        break;
      case "⌥i":
        openEditor();
        break;
      case "c":
        setActiveModal("manageCollaborators");
        break;
      case "v":
        toggleSecrets();
        break;
      case "g":
        open(DASHBOARD_URL);
        break;
    }
  };

  const isBusy = isProcessing || collaborators.isBusy || itemActions.isBusy;

  useKeyboard((key) => {
    if (proNotice.visible) return;
    if (creatingItem || editingItem) return;
    if (payment.isModalOpen) return;

    if (unlock.isPromptVisible) {
      if (key.name === "escape") unlock.cancel();
      return;
    }

    if (isBusy || unlock.isVerifying) return;

    if (activeModal === "bulkImport") {
      bulkImport.handleKey(key);
      return;
    }

    if (activeModal === "commandPalette" || activeModal === "manageCollaborators") return;

    if (confirmingDelete) {
      if (key.name === "y") itemActions.deleteItem();
      else if (key.name === "n" || key.name === "escape") itemActions.setConfirmingDelete(null);
      return;
    }

    if (key.name === "g" && !key.meta && !key.ctrl) {
      open(DASHBOARD_URL);
    } else if (key.name === "escape" || key.name === "backspace") {
      goBack();
    } else if (key.name === "k" || key.name === "up") {
      navigation.moveUp();
    } else if (key.name === "j" || key.name === "down") {
      navigation.moveDown();
    } else if (key.name === "return" || key.name === "l" || key.name === "right") {
      navigation.select();
    } else if (key.name === "d" && !isRestricted) {
      startDelete();
    } else if (key.name === "n" && !key.meta && !isRestricted) {
      startCreate();
    } else if (key.name === "u" && !key.meta && !isRestricted) {
      startRename();
    } else if (
      (key.name === "i" || key.name === "u") &&
      key.meta &&
      !isRestricted &&
      viewLevel !== "environments"
    ) {
      openEditor();
    } else if (key.name === "c" && !isRestricted) {
      setActiveModal("manageCollaborators");
    } else if (key.name === "v") {
      toggleSecrets();
    } else if (key.sequence === "?") {
      setActiveModal("commandPalette");
    }
  });

  const getShortcuts = () => {
    const isDisabled = isProcessing || collaborators.isBusy || itemActions.isBusy;

    if (creatingItem || editingItem) {
      return {
        primary: [
          {
            shortcuts: [
              {
                key: KEY_SYMBOLS.enter,
                description: creatingItem ? "create" : "save",
                disabled: isDisabled,
              },
              { key: "esc", description: "cancel", disabled: isDisabled },
            ],
          },
        ],
        secondary: [],
      };
    }

    const disabled = isDisabled || isRestricted;
    const shortcuts =
      viewLevel === "environments"
        ? [
            { key: "n", description: "create environment", disabled },
            { key: "u", description: "rename environment", disabled },
          ]
        : viewLevel === "environment"
          ? [
              { key: "n", description: "create folder", disabled },
              { key: "⌥i", description: "edit secrets", disabled },
              ...(selectedItem?.type !== "secret"
                ? [{ key: "u", description: "rename folder", disabled }]
                : []),
            ]
          : [{ key: "⌥i", description: "edit secrets", disabled }];
    return { primary: [{ shortcuts }], secondary: [] };
  };

  const getItemCounts = () => {
    if (viewLevel === "environments") return `${environments.length} environments`;
    const secretCount = secretsInView(secrets, location).length;
    if (viewLevel === "folder") return `${secretCount} secrets`;
    const folderCount = folders.filter((f) => f.environmentId === selectedEnvId).length;
    return `${folderCount} folders · ${secretCount} secrets`;
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
          width={70}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box
            height={1}
            width={66}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            marginBottom={1}
          >
            <text>
              <span fg={THEME_COLORS.primary}>relic</span>
              <span fg={THEME_COLORS.textDim}> / </span>
              <span fg={THEME_COLORS.text}>
                <strong>{projectName}</strong>
              </span>
              {selectedEnv && (
                <>
                  <span fg={THEME_COLORS.textDim}> / </span>
                  <span fg={THEME_COLORS.secondary}>{selectedEnv.name}</span>
                </>
              )}
              {selectedFolder && (
                <>
                  <span fg={THEME_COLORS.textDim}> / </span>
                  <span fg={THEME_COLORS.accent}>{selectedFolder.name}</span>
                </>
              )}
            </text>
            <text>
              <span fg={STATUS_COLORS[projectStatus]}>
                {projectStatus === "owned" ? "●" : projectStatus === "shared" ? "◉" : "○"}{" "}
                {projectStatus}
              </span>
            </text>
          </box>

          <ProjectItemList
            items={items}
            viewLevel={viewLevel}
            selectedIndex={navigation.selectedIndex}
            scrollOffset={navigation.scrollOffset}
            pageSize={PAGE_SIZE}
            showSecrets={showSecrets}
            creatingItem={creatingItem}
            editingItem={editingItem}
            confirmingDelete={confirmingDelete}
            onCreate={itemActions.createItem}
            onCancelCreate={() => itemActions.setCreatingItem(null)}
            onRename={itemActions.renameItem}
            onCancelRename={() => itemActions.setEditingItem(null)}
          />

          <box flexDirection="column" marginTop={1}>
            <box height={1} width={66} flexDirection="row" justifyContent="space-between">
              <text fg={THEME_COLORS.textDim}>Collaborators [{sharedUsers.length}]</text>
              <text fg={THEME_COLORS.textDim}>{getItemCounts()}</text>
            </box>
          </box>

          {(activeModal === "none" || activeModal === "commandPalette") && (
            <box marginTop={1}>
              <GuideBar
                groups={getShortcuts()}
                inline={true}
                customWidth={66}
                minimal={true}
                showHelp={true}
              />
            </box>
          )}
        </box>
      </box>

      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        projectName={projectName}
        collaborators={sharedUsers}
        onAdd={(email) => collaborators.addCollaborator(email)}
        onRevoke={(collab) => collaborators.revokeCollaborator(collab, false)}
        onRevokeWithRotation={(collab) => collaborators.revokeCollaborator(collab, true)}
        onClose={closeModal}
        pendingEmail={collaborators.pendingEmail}
        shareLimits={shareLimits}
      />

      <CheckoutRedirectModal checkoutUrl={payment.checkoutUrl} onClose={payment.closeCheckout} />

      <ProWelcomeModal visible={proNotice.visible} onClose={proNotice.dismiss} />

      <ConfirmPaymentModal
        visible={payment.confirmationModal.visible}
        type={payment.confirmationModal.type}
        itemName={payment.confirmationModal.itemName}
        balance={payment.confirmationModal.balance}
        onConfirm={collaborators.confirmPayment}
        onCancel={collaborators.cancelPayment}
      />

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={getAllCommands()}
        onExecute={executeCommand}
        onClose={closeModal}
      />

      <BulkImportModal
        visible={activeModal === "bulkImport"}
        content={bulkImport.content}
        cursor={bulkImport.cursor}
        format={bulkImport.format}
        collisions={bulkImport.collisions}
        cursorVisible={true}
        onClose={bulkImport.close}
      />

      <Modal visible={unlock.isPromptVisible} title="Enter Password" width={50} height={12}>
        <PasswordInput
          mode="verify"
          onSubmit={unlock.verify}
          onCancel={unlock.cancel}
          width={46}
          disabled={unlock.isVerifying}
          error={unlock.error}
        />
      </Modal>
    </box>
  );
}
