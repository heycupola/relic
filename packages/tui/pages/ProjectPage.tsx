/** @jsxImportSource @opentui/react */
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { extractErrorMessage } from "@repo/auth";
import { trackEvent } from "@repo/logger";
import { useEffect, useMemo, useRef, useState } from "react";
import { InlineInput } from "../components/forms/InlineInput";
import { BulkImportModal } from "../components/modals/BulkImportModal";
import { CheckoutRedirectModal } from "../components/modals/CheckoutRedirectModal";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import { ConfirmPaymentModal } from "../components/modals/ConfirmPaymentModal";
import { ManageCollaboratorsModal } from "../components/modals/ManageCollaboratorsModal";
import { ProWelcomeModal } from "../components/modals/ProWelcomeModal";
import { SecretHistoryModal } from "../components/modals/SecretHistoryModal";
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
import type { Shortcut } from "../types/keyboard";
import type { ModalType, ProjectStatus, ViewLevel } from "../types/models";
import {
  DASHBOARD_URL,
  KEY_SYMBOLS,
  STATUS_COLORS,
  STATUS_ICONS,
  THEME_COLORS,
} from "../utils/constants";
import { buildProjectItems, type ProjectLocation, secretsInView } from "../utils/projectItems";
import { POLICY_INPUT_MAX_LENGTH, parsePolicyInput } from "../utils/rotation";
import { openUrl, truncate } from "../utils/ui";

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
}

const PAGE_SIZE = 10;
const CONTENT_WIDTH = 66;
const COMMAND_CATEGORIES = ["Navigate", "Create", "Manage", "View"];
const OWNER_ONLY_MESSAGE = "Only the project owner can manage collaborators";
const READ_ONLY_MESSAGE = "This project is read-only while it's restricted";

function isPlain(key: { ctrl: boolean; meta: boolean; option: boolean }) {
  return !key.ctrl && !key.meta && !key.option;
}

export function ProjectPage({
  projectId,
  projectName,
  projectStatus: initialStatus,
}: ProjectPageProps) {
  useEffect(() => {
    trackEvent("tui_page_viewed", { page: "project" });
  }, []);
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const { goBack: routerGoBack } = useRouter();
  const { isProcessing, showError, showSuccess, attemptTask } = useTaskQueue();

  const {
    project,
    isOwner,
    liveStatus,
    projectKey,
    environments,
    environmentsError,
    isLoadingEnvs,
    folders,
    secrets,
    loadedEnvironmentId,
    secretsError,
    isLoadingSecrets,
    sharedUsers,
    shareLimits,
    loadEnvironment,
    clearEnvironment,
    decryptSecrets,
    createEnv,
    updateEnv,
    removeEnv,
    setEnvRotationPolicy,
    createFolder,
    updateFolder,
    deleteFolder,
    updateSecretBulk,
    deleteSecret,
    setSecretRotationPolicy,
    shareProject,
    revokeShare,
    revokeShareWithRotation,
    refetchProject,
    reloadProjectKey,
  } = useProjectPage(projectId);

  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [revealedValues, setRevealedValues] = useState<Map<string, string> | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [editingPolicy, setEditingPolicy] = useState<{
    type: "env" | "secret";
    id: string;
    name: string;
    rotateEveryDays?: number;
  } | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const closeModal = () => setActiveModal("none");

  const projectStatus: ProjectStatus =
    liveStatus ?? (project?.isArchived ? "archived" : initialStatus);
  const displayName = project?.name ?? projectName;
  const isRestricted = projectStatus === "restricted" || projectStatus === "archived";

  const location = useMemo<ProjectLocation>(
    () => ({ viewLevel, environmentId: selectedEnvId, folderId: selectedFolderId }),
    [viewLevel, selectedEnvId, selectedFolderId],
  );
  const secretsInLocation = useMemo(() => secretsInView(secrets, location), [secrets, location]);
  const items = buildProjectItems(location, environments, folders, secrets, revealedValues);
  const selectedEnv = environments.find((e) => e.id === selectedEnvId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // NOTE: Plaintext only exists while values are shown; hiding them or leaving drops it.
  useEffect(() => {
    if (!showSecrets) {
      setRevealedValues(null);
      return;
    }
    let cancelled = false;
    decryptSecrets(secretsInLocation)
      .then((values) => {
        if (!cancelled) setRevealedValues(values);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setShowSecrets(false);
        showError(extractErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [showSecrets, secretsInLocation, decryptSecrets, showError]);

  const keySignature = projectKey
    ? `${projectKey.keyVersion}:${projectKey.encryptedProjectKey}`
    : null;
  const lastKeySignatureRef = useRef(keySignature);
  const selectedEnvIdRef = useRef(selectedEnvId);
  selectedEnvIdRef.current = selectedEnvId;

  useEffect(() => {
    if (lastKeySignatureRef.current === keySignature) return;
    lastKeySignatureRef.current = keySignature;
    if (selectedEnvIdRef.current) void loadEnvironment(selectedEnvIdRef.current);
  }, [keySignature, loadEnvironment]);

  const navigation = useListNavigation({
    items,
    pageSize: PAGE_SIZE,
    onSelect: (index) => {
      const item = items[index];
      if (item?.type === "env") {
        setSelectedEnvId(item.id);
        setViewLevel("environment");
        navigation.reset();
        void loadEnvironment(item.id);
      } else if (item?.type === "folder") {
        setSelectedFolderId(item.id);
        setViewLevel("folder");
        navigation.reset();
      }
    },
  });
  const selectedItem = items[navigation.selectedIndex];
  const selectedSecret = selectedItem?.type === "secret" ? selectedItem : null;

  const leaveEnvironment = () => {
    setShowSecrets(false);
    setSelectedFolderId(null);
    setSelectedEnvId(null);
    setViewLevel("environments");
    clearEnvironment();
  };

  const goBack = () => {
    if (viewLevel === "folder") {
      setSelectedFolderId(null);
      setViewLevel("environment");
    } else if (viewLevel === "environment") {
      leaveEnvironment();
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
        leaveEnvironment();
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
    onKeyRotated: reloadProjectKey,
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

  const openingEditorRef = useRef(false);
  const openEditor = () =>
    unlock.requireUnlock(() => {
      if (openingEditorRef.current) return;
      openingEditorRef.current = true;
      decryptSecrets(secretsInLocation)
        .then((values) => {
          const failed = secretsInLocation.filter((s) => !values.has(s.id)).length;
          if (failed > 0) {
            showError(
              `Couldn't decrypt ${failed} secret${failed === 1 ? "" : "s"}. Reload the project and try again.`,
            );
            return;
          }
          bulkImport.open(secretsInLocation, values);
          setActiveModal("bulkImport");
        })
        .catch((error: unknown) => showError(extractErrorMessage(error)))
        .finally(() => {
          openingEditorRef.current = false;
        });
    });

  const toggleSecrets = () => {
    if (showSecrets) setShowSecrets(false);
    else unlock.requireUnlock(() => setShowSecrets(true));
  };

  const whenWritable = (action: () => void) => {
    if (isRestricted) showError(READ_ONLY_MESSAGE);
    else action();
  };

  const openCollaborators = () => {
    if (!isOwner) showError(OWNER_ONLY_MESSAGE);
    else if (isRestricted) showError(READ_ONLY_MESSAGE);
    else setActiveModal("manageCollaborators");
  };

  const openHistory = () => {
    if (selectedSecret) setActiveModal("secretHistory");
  };

  const startCreate = () =>
    whenWritable(() => {
      if (viewLevel === "environments") itemActions.setCreatingItem("env");
      else if (viewLevel === "environment") itemActions.setCreatingItem("folder");
    });

  const startRename = () =>
    whenWritable(() => {
      if (selectedItem?.type === "env" || selectedItem?.type === "folder") {
        itemActions.setEditingItem({
          type: selectedItem.type,
          id: selectedItem.id,
          name: selectedItem.name,
        });
      }
    });

  const startDelete = () =>
    whenWritable(() => {
      if (selectedItem) {
        itemActions.setConfirmingDelete({
          type: selectedItem.type,
          id: selectedItem.id,
          name: selectedItem.name,
        });
      }
    });

  const openPolicyEditor = () =>
    whenWritable(() => {
      const target =
        selectedItem?.type === "env" || selectedItem?.type === "secret"
          ? { ...selectedItem, type: selectedItem.type }
          : selectedEnv
            ? { ...selectedEnv, type: "env" as const }
            : null;
      if (!target) return;
      setPolicyError(null);
      setEditingPolicy({
        type: target.type,
        id: target.id,
        name: target.name,
        rotateEveryDays: target.rotateEveryDays,
      });
    });

  const savePolicy = async (input: string) => {
    if (isSavingPolicy || !editingPolicy) return;
    const parsed = parsePolicyInput(input);
    if (!parsed.ok) {
      setPolicyError(parsed.error);
      return;
    }
    const { rotateEveryDays } = parsed;
    if (rotateEveryDays === (editingPolicy.rotateEveryDays ?? null)) {
      setEditingPolicy(null);
      return;
    }
    const { type, id, name } = editingPolicy;
    const label = type === "env" ? `environment "${name}"` : name;
    setIsSavingPolicy(true);
    const saved = await attemptTask(`Updating rotation policy for ${label}...`, () =>
      type === "env"
        ? setEnvRotationPolicy(id, rotateEveryDays)
        : setSecretRotationPolicy(id, rotateEveryDays),
    );
    setIsSavingPolicy(false);
    if (!saved) return;
    trackEvent("rotation_policy_updated", { target: type, cleared: rotateEveryDays === null });
    showSuccess(
      rotateEveryDays === null
        ? `Rotation policy cleared for ${label}`
        : `${label} rotates every ${rotateEveryDays}d`,
    );
    setEditingPolicy(null);
  };

  const startEdit = () => {
    if (viewLevel !== "environments") whenWritable(openEditor);
  };

  const getAllCommands = () => {
    const cmds: Array<{ key: string; description: string; category: string; disabled?: boolean }> =
      [];
    if (viewLevel === "environments") {
      cmds.push(
        { key: "n", description: "Create environment", category: "Create", disabled: isRestricted },
        { key: "u", description: "Rename environment", category: "Manage", disabled: isRestricted },
        { key: "d", description: "Delete environment", category: "Manage", disabled: isRestricted },
        {
          key: "r",
          description: "Set environment rotation policy",
          category: "Manage",
          disabled: isRestricted,
        },
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
        { key: "e", description: "Edit secrets", category: "Manage", disabled: isRestricted },
        {
          key: "d",
          description: selectedItem?.type === "folder" ? "Delete folder" : "Delete secret",
          category: "Manage",
          disabled: isRestricted || !selectedItem,
        },
        {
          key: "r",
          description:
            selectedItem?.type === "secret"
              ? "Set secret rotation policy"
              : "Set environment rotation policy",
          category: "Manage",
          disabled: isRestricted,
        },
        { key: "g", description: "Open dashboard", category: "Navigate" },
        { key: "esc", description: "Go back", category: "Navigate" },
        { key: "v", description: showSecrets ? "Hide values" : "Show values", category: "View" },
      );
      if (selectedSecret) {
        cmds.push({ key: "t", description: "Secret history", category: "View" });
      }
    }
    cmds.push(
      {
        key: "c",
        description: isOwner ? "Manage collaborators" : "Manage collaborators (owner only)",
        category: "Manage",
        disabled: isRestricted || !isOwner,
      },
      { key: "q", description: "Quit", category: "Navigate" },
    );
    return cmds.sort(
      (a, b) => COMMAND_CATEGORIES.indexOf(a.category) - COMMAND_CATEGORIES.indexOf(b.category),
    );
  };

  const executeCommand = (cmd: { key: string }) => {
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
      case "e":
        startEdit();
        break;
      case "c":
        openCollaborators();
        break;
      case "v":
        toggleSecrets();
        break;
      case "t":
        openHistory();
        break;
      case "r":
        openPolicyEditor();
        break;
      case "g":
        void openUrl(DASHBOARD_URL);
        break;
      case "q":
        renderer.destroy();
        break;
    }
  };

  const isBusy = isProcessing || collaborators.isBusy || itemActions.isBusy || isSavingPolicy;

  useKeyboard((key) => {
    if (proNotice.visible) return;
    if (creatingItem || editingItem || editingPolicy) return;
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

    if (
      activeModal === "commandPalette" ||
      activeModal === "manageCollaborators" ||
      activeModal === "secretHistory"
    ) {
      return;
    }

    if (confirmingDelete) {
      if (key.name === "y") void itemActions.deleteItem();
      else if (key.name === "n" || key.name === "escape") itemActions.setConfirmingDelete(null);
      return;
    }

    // NOTE: ⌥i/⌥u only reach the app when the terminal sends Option as Meta, so "e" is the default.
    if ((key.name === "i" || key.name === "u") && key.meta) {
      startEdit();
      return;
    }

    if (!isPlain(key) && !["up", "down", "left", "right"].includes(key.name)) return;

    if (key.name === "g") {
      void openUrl(DASHBOARD_URL);
    } else if (["escape", "backspace", "h", "left"].includes(key.name)) {
      goBack();
    } else if (key.name === "k" || key.name === "up") {
      navigation.moveUp();
    } else if (key.name === "j" || key.name === "down") {
      navigation.moveDown();
    } else if (key.name === "return" || key.name === "l" || key.name === "right") {
      navigation.select();
    } else if (key.name === "d") {
      startDelete();
    } else if (key.name === "n") {
      startCreate();
    } else if (key.name === "u") {
      startRename();
    } else if (key.name === "e") {
      startEdit();
    } else if (key.name === "c") {
      openCollaborators();
    } else if (key.name === "v" && viewLevel !== "environments") {
      toggleSecrets();
    } else if (key.name === "t") {
      openHistory();
    } else if (key.name === "r") {
      openPolicyEditor();
    } else if (key.name === "q") {
      renderer.destroy();
    } else if (key.sequence === "?") {
      setActiveModal("commandPalette");
    }
  });

  const getShortcuts = () => {
    const isDisabled = isBusy;

    if (creatingItem || editingItem || editingPolicy) {
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
    const hasSelection = selectedItem !== undefined;
    const canOpen = selectedItem?.type === "env" || selectedItem?.type === "folder";
    const primary: Shortcut[] =
      viewLevel === "environments"
        ? [
            { key: KEY_SYMBOLS.enter, description: "open", disabled: isDisabled || !canOpen },
            { key: "n", description: "new environment", disabled },
            { key: "u", description: "rename", disabled: disabled || !hasSelection },
            { key: "d", description: "delete", disabled: disabled || !hasSelection },
            { key: "r", description: "rotation", disabled: disabled || !hasSelection },
          ]
        : [
            { key: "e", description: "edit secrets", disabled },
            {
              key: "v",
              description: showSecrets ? "hide values" : "show values",
              disabled: isDisabled,
            },
            ...(viewLevel === "environment"
              ? [
                  { key: "n", description: "new folder", disabled },
                  ...(selectedItem?.type === "folder"
                    ? [{ key: "u", description: "rename", disabled }]
                    : []),
                ]
              : []),
            { key: "d", description: "delete", disabled: disabled || !hasSelection },
            { key: "r", description: "rotation", disabled },
            ...(selectedSecret ? [{ key: "t", description: "history", disabled: isDisabled }] : []),
          ];

    const secondary: Shortcut[] = [
      ...(isOwner ? [{ key: "c", description: "collaborators", disabled }] : []),
      { key: "g", description: "dashboard", disabled: isDisabled },
      { key: "esc", description: "back", disabled: isDisabled },
      { key: "q", description: "quit", disabled: isDisabled },
    ];

    return { primary: [{ shortcuts: primary }], secondary: [{ shortcuts: secondary }] };
  };

  const getItemCounts = () => {
    if (viewLevel === "environments") return `${environments.length} environments`;
    const secretCount = secretsInLocation.length;
    if (viewLevel === "folder") return `${secretCount} secrets`;
    const folderCount = folders.filter((f) => f.environmentId === selectedEnvId).length;
    return `${folderCount} folders · ${secretCount} secrets`;
  };

  const isEnvironmentLoading =
    viewLevel !== "environments" && (isLoadingSecrets || loadedEnvironmentId !== selectedEnvId);
  const listError =
    viewLevel === "environments"
      ? environmentsError && `Couldn't load environments: ${extractErrorMessage(environmentsError)}`
      : secretsError && `Couldn't load this environment: ${extractErrorMessage(secretsError)}`;
  const emptyMessage =
    viewLevel === "environments"
      ? isRestricted
        ? "No environments."
        : "No environments yet. Press n to create one."
      : isRestricted
        ? "No secrets."
        : viewLevel === "environment"
          ? "No folders or secrets yet. Press e to add secrets."
          : "No secrets yet. Press e to add secrets.";

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
          width={CONTENT_WIDTH + 4}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box
            height={1}
            width={CONTENT_WIDTH}
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            marginBottom={1}
          >
            <text>
              <span fg={THEME_COLORS.primary}>relic</span>
              <span fg={THEME_COLORS.textDim}> / </span>
              <span fg={THEME_COLORS.text}>
                <strong>{truncate(displayName, selectedEnv ? 15 : 40)}</strong>
              </span>
              {selectedEnv && (
                <>
                  <span fg={THEME_COLORS.textDim}> / </span>
                  <span fg={THEME_COLORS.secondary}>
                    {truncate(selectedEnv.name, selectedFolder ? 12 : 24)}
                  </span>
                </>
              )}
              {selectedFolder && (
                <>
                  <span fg={THEME_COLORS.textDim}> / </span>
                  <span fg={THEME_COLORS.accent}>{truncate(selectedFolder.name, 12)}</span>
                </>
              )}
            </text>
            <text>
              <span fg={STATUS_COLORS[projectStatus]}>
                {STATUS_ICONS[projectStatus]} {projectStatus}
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
            environmentRotateEveryDays={selectedEnv?.rotateEveryDays}
            isLoading={viewLevel === "environments" ? isLoadingEnvs : isEnvironmentLoading}
            error={listError || null}
            emptyMessage={emptyMessage}
            creatingItem={creatingItem}
            editingItem={editingItem}
            confirmingDelete={confirmingDelete}
            onCreate={itemActions.createItem}
            onCancelCreate={() => itemActions.setCreatingItem(null)}
            onRename={itemActions.renameItem}
            onCancelRename={() => itemActions.setEditingItem(null)}
          />

          {editingPolicy && (
            <box flexDirection="column" width={CONTENT_WIDTH}>
              <text fg={THEME_COLORS.textDim}>
                {"  "}Rotate <span fg={THEME_COLORS.text}>{truncate(editingPolicy.name, 30)}</span>{" "}
                every N days · 0 clears
              </text>
              <InlineInput
                active={!isSavingPolicy}
                initialValue={
                  editingPolicy.rotateEveryDays ? String(editingPolicy.rotateEveryDays) : ""
                }
                onSubmit={(value) => void savePolicy(value)}
                onCancel={() => setEditingPolicy(null)}
                onChange={() => setPolicyError(null)}
                maxWidth={10}
                maxLength={POLICY_INPUT_MAX_LENGTH}
                width={CONTENT_WIDTH}
                icon="[↻]"
                iconColor={THEME_COLORS.secondary}
                placeholder="e.g. 90"
                showCount={false}
                error={policyError}
              />
            </box>
          )}

          <box flexDirection="column" marginTop={1}>
            <box
              height={1}
              width={CONTENT_WIDTH}
              flexDirection="row"
              justifyContent="space-between"
            >
              <text fg={THEME_COLORS.textMuted}>
                {isOwner ? `Collaborators [${sharedUsers.length}]` : "Shared with you"}
              </text>
              <text fg={THEME_COLORS.textMuted}>{getItemCounts()}</text>
            </box>
            {isRestricted && (
              <box height={1} width={CONTENT_WIDTH}>
                <text fg={THEME_COLORS.warning}>
                  {projectStatus === "archived"
                    ? "This project is archived and read-only."
                    : isOwner
                      ? "Restricted: over the Free plan limit. Upgrade to Pro to edit."
                      : "Restricted by the owner's plan. Values are read-only."}
                </text>
              </box>
            )}
          </box>

          {(activeModal === "none" || activeModal === "commandPalette") && (
            <box marginTop={1}>
              <GuideBar groups={getShortcuts()} customWidth={CONTENT_WIDTH} showHelp={true} />
            </box>
          )}
        </box>
      </box>

      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        projectName={displayName}
        collaborators={sharedUsers}
        onAdd={(email) => void collaborators.addCollaborator(email)}
        onRevoke={(collab) => void collaborators.revokeCollaborator(collab, false)}
        onRevokeWithRotation={(collab) => void collaborators.revokeCollaborator(collab, true)}
        onClose={closeModal}
        pendingEmail={collaborators.pendingEmail}
        shareLimits={shareLimits}
        inputDisabled={payment.isModalOpen || proNotice.visible}
      />

      <SecretHistoryModal
        visible={activeModal === "secretHistory"}
        secretId={selectedSecret?.id ?? null}
        secretKey={selectedSecret?.name ?? ""}
        showValues={showSecrets}
        isRestricted={isRestricted}
        onRestored={() => {
          if (selectedEnvId) void loadEnvironment(selectedEnvId);
        }}
        onClose={closeModal}
      />

      <CheckoutRedirectModal checkoutUrl={payment.checkoutUrl} onClose={payment.closeCheckout} />

      <ProWelcomeModal visible={proNotice.visible} onClose={proNotice.dismiss} />

      <ConfirmPaymentModal
        visible={payment.confirmationModal.visible}
        type={payment.confirmationModal.type}
        itemName={payment.confirmationModal.itemName}
        message={payment.confirmationModal.message}
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

      <Modal visible={unlock.isPromptVisible} title="Enter password" width={50} height={8}>
        <PasswordInput
          mode="verify"
          onSubmit={unlock.verify}
          onCancel={unlock.cancel}
          width={46}
          disabled={unlock.isVerifying}
          error={unlock.error}
          additionalShortcuts={[
            { key: "esc", description: "cancel", disabled: unlock.isVerifying },
          ]}
        />
      </Modal>
    </box>
  );
}
