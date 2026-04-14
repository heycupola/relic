import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { extractErrorMessage, verifyPassword } from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import open from "open";
import { useCallback, useEffect, useRef, useState } from "react";
import { InlineInput } from "../components/forms/InlineInput";
import { BulkImportModal } from "../components/modals/BulkImportModal";
import { CommandPaletteModal } from "../components/modals/CommandPaletteModal";
import {
  ConfirmPaymentModal,
  type PaymentConfirmationType,
} from "../components/modals/ConfirmPaymentModal";
import { ManageCollaboratorsModal } from "../components/modals/ManageCollaboratorsModal";
import {
  BillingPortalModal,
  type CheckoutReason,
  CheckoutRedirectModal,
} from "../components/modals/UrlOpenModal";
import { PasswordInput } from "../components/PasswordInput";
import { DeleteConfirmation } from "../components/shared/DeleteConfirmation";
import { GuideBar } from "../components/shared/GuideBar";
import { Modal } from "../components/shared/Modal";
import { useUser } from "../context";
import { useMultiLineInput } from "../hooks/useInput";
import { usePaste } from "../hooks/usePaste";
import { useProjectPage } from "../hooks/useProjectPage";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type { ModalType, ProjectStatus, SharedUser, ViewLevel } from "../types/models";
import type { BulkImportFormat, CollisionInfo } from "../utils/bulkImport";
import {
  computeRemovedKeys,
  envToJson,
  jsonToEnv,
  parseEnvContent,
  validateBulkImportJson,
} from "../utils/bulkImport";
import { DASHBOARD_URL, KEY_SYMBOLS, STATUS_COLORS, THEME_COLORS } from "../utils/constants";

const logger = createLogger("tui");

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
}

const PAGE_SIZE = 10;

export function ProjectPage({ projectId, projectName, projectStatus }: ProjectPageProps) {
  useEffect(() => {
    trackEvent("tui_page_viewed", { page: "project" });
  }, []);
  const { width, height } = useTerminalDimensions();
  const { goBack: routerGoBack } = useRouter();
  const {
    runTask,
    setTaskPending,
    continueTask,
    cancelTask,
    showSuccess,
    showError,
    isProcessing,
  } = useTaskQueue();
  const { hasPro, isLoading: isLoadingPlan } = useUser();

  const {
    project,
    environments,
    folders,
    secrets,
    sharedUsers,
    shareLimits,
    loadEnvironment: loadEnvironmentData,
    createEnv: createEnvironment,
    updateEnv: updateEnvironment,
    removeEnv: deleteEnvironment,
    createFolder,
    updateFolder,
    deleteFolder,
    updateSecretBulk,
    deleteSecret,
    shareProject,
    revokeShare,
    revokeShareWithRotation,
    refetchProject: refetchProjectData,
  } = useProjectPage(projectId);

  const [showProSuccess, setShowProSuccess] = useState(false);
  const prevHasProRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isLoadingPlan) return;
    if (prevHasProRef.current !== null && hasPro && !prevHasProRef.current) {
      refetchProjectData();
      setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
      setBillingPortalModal({ visible: false, url: "" });
      setShowProSuccess(true);
    }
    prevHasProRef.current = hasPro;
  }, [hasPro, isLoadingPlan, refetchProjectData]);

  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);

  const [activeModal, setActiveModal] = useState<ModalType>("none");

  const [creatingItem, setCreatingItem] = useState<"env" | "folder" | null>(null);
  const [editingItem, setEditingItem] = useState<{
    type: "env" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{
    type: "env" | "folder" | "secret";
    id: string;
    name: string;
  } | null>(null);

  const bulkImportInput = useMultiLineInput({ maxLines: 50 });
  const [bulkImportFormat, setBulkImportFormat] = useState<BulkImportFormat>("env");
  const [bulkImportScopes, setBulkImportScopes] = useState<Map<string, string>>(new Map());
  const [bulkImportCollisions, setBulkImportCollisions] = useState<CollisionInfo[]>([]);

  const [pendingCollaboratorEmail, setPendingCollaboratorEmail] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    type: PaymentConfirmationType;
    email?: string;
    balance: number;
  }>({
    visible: false,
    type: "seat",
    balance: 0,
  });
  const [checkoutModal, setCheckoutModal] = useState<{
    visible: boolean;
    url: string;
    reason: CheckoutReason;
  }>({ visible: false, url: "", reason: "pro_required" });
  const [billingPortalModal, setBillingPortalModal] = useState<{
    visible: boolean;
    url: string;
  }>({ visible: false, url: "" });

  const [isAddingCollaborator, setIsAddingCollaborator] = useState(false);
  const [isRevokingCollaborator, setIsRevokingCollaborator] = useState(false);
  const [isRevokingWithRotation, setIsRevokingWithRotation] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isRenamingItem, setIsRenamingItem] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isSessionUnlocked, setIsSessionUnlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState<"toggle" | "editor" | null>(null);

  const isRestricted = projectStatus === "restricted" || projectStatus === "archived";

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const getCurrentItems = useCallback(() => {
    if (viewLevel === "environments") {
      return environments.map((e) => ({ type: "env" as const, id: e.id, name: e.name }));
    }
    if (viewLevel === "environment" && selectedEnvId) {
      const envFolders = folders.filter((f) => f.environmentId === selectedEnvId);
      const rootSecrets = secrets.filter((s) => s.environmentId === selectedEnvId && !s.folderId);
      return [
        ...envFolders.map((f) => ({ type: "folder" as const, id: f.id, name: f.name })),
        ...rootSecrets.map((s) => ({
          type: "secret" as const,
          id: s.id,
          name: s.key,
          value: s.value,
          secretType: s.type || "string",
          secretScope: s.scope || "shared",
        })),
      ];
    }
    if (viewLevel === "folder" && selectedFolderId) {
      return secrets
        .filter((s) => s.folderId === selectedFolderId)
        .map((s) => ({
          type: "secret" as const,
          id: s.id,
          name: s.key,
          value: s.value,
          secretType: s.type || "string",
          secretScope: s.scope || "shared",
        }));
    }
    return [];
  }, [viewLevel, selectedEnvId, selectedFolderId, environments, folders, secrets]);

  const items = getCurrentItems();

  useEffect(() => {
    if (activeModal !== "bulkImport") return;
    const trimmed = bulkImportInput.value.trim();
    if (!trimmed) {
      setBulkImportCollisions([]);
      return;
    }

    try {
      const parsed = bulkImportFormat === "env" ? parseEnvContent(trimmed) : JSON.parse(trimmed);
      const result = validateBulkImportJson(parsed);
      if (result.valid && result.secrets.length > 0) {
        const collisions: CollisionInfo[] = result.secrets
          .filter((s) => secrets.some((existing) => existing.key === s.key))
          .map((s) => ({
            key: s.key,
            existingSecretId: secrets.find((e) => e.key === s.key)?.id || "",
          }));
        setBulkImportCollisions(collisions);
      } else {
        setBulkImportCollisions([]);
      }
    } catch {
      setBulkImportCollisions([]);
    }
  }, [bulkImportInput.value, bulkImportFormat, activeModal, secrets]);

  usePaste((text) => {
    if (activeModal === "bulkImport") {
      bulkImportInput.handlePaste(text);
    }
  });

  const moveUp = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : items.length - 1;
      if (next < scrollOffset) setScrollOffset(next);
      else if (next >= scrollOffset + PAGE_SIZE)
        setScrollOffset(Math.max(0, items.length - PAGE_SIZE));
      return next;
    });
  };

  const moveDown = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev < items.length - 1 ? prev + 1 : 0;
      if (next >= scrollOffset + PAGE_SIZE) setScrollOffset(next - PAGE_SIZE + 1);
      else if (next < scrollOffset) setScrollOffset(0);
      return next;
    });
  };

  const enter = async () => {
    const item = items[selectedIndex];
    if (!item) return;
    if (item.type === "env") {
      setSelectedEnvId(item.id);
      setViewLevel("environment");
      setSelectedIndex(0);
      setScrollOffset(0);
      await loadEnvironmentData(item.id);
    } else if (item.type === "folder") {
      setSelectedFolderId(item.id);
      setViewLevel("folder");
      setSelectedIndex(0);
      setScrollOffset(0);
    }
  };

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
    setSelectedIndex(0);
    setScrollOffset(0);
  };

  const handleCreateItem = async (name: string) => {
    if (isCreatingItem) return;
    if (!creatingItem) return;
    setIsCreatingItem(true);
    try {
      if (creatingItem === "env") {
        await runTask(`Creating environment "${name}"...`, async () => {
          await createEnvironment(name);
        });
        trackEvent("environment_created", { success: true });
        showSuccess(`Environment "${name}" created`);
      } else if (creatingItem === "folder" && selectedEnvId) {
        await runTask(`Creating folder "${name}"...`, async () => {
          await createFolder(selectedEnvId, name);
        });
        trackEvent("folder_created", { success: true });
        showSuccess(`Folder "${name}" created`);
      }
      setCreatingItem(null);
    } catch {
      trackEvent(creatingItem === "env" ? "environment_created" : "folder_created", {
        success: false,
      });
    } finally {
      setIsCreatingItem(false);
    }
  };

  const handleRenameItem = async (name: string) => {
    if (isRenamingItem) return;
    if (!editingItem || name === editingItem.name) {
      setEditingItem(null);
      return;
    }
    setIsRenamingItem(true);
    try {
      if (editingItem.type === "env") {
        await runTask(`Renaming environment to "${name}"...`, async () => {
          await updateEnvironment(editingItem.id, name);
        });
        trackEvent("environment_renamed", { success: true });
        showSuccess(`Environment renamed to "${name}"`);
      } else if (editingItem.type === "folder") {
        await runTask(`Renaming folder to "${name}"...`, async () => {
          await updateFolder(editingItem.id, name);
        });
        trackEvent("folder_renamed", { success: true });
        showSuccess(`Folder renamed to "${name}"`);
      }
      setEditingItem(null);
    } catch {
      // Error handled by finally block
    } finally {
      setIsRenamingItem(false);
    }
  };

  const handleDeleteItem = async () => {
    if (isDeletingItem) return;
    if (!confirmingDelete) return;
    setIsDeletingItem(true);
    try {
      if (confirmingDelete.type === "env") {
        await runTask(`Deleting environment "${confirmingDelete.name}"...`, async () => {
          await deleteEnvironment(confirmingDelete.id);
        });
        trackEvent("environment_deleted", { success: true });
        showSuccess(`Environment "${confirmingDelete.name}" deleted`);
        if (selectedEnvId === confirmingDelete.id) {
          setSelectedEnvId(null);
          setViewLevel("environments");
        }
      } else if (confirmingDelete.type === "folder") {
        await runTask(`Deleting folder "${confirmingDelete.name}"...`, async () => {
          await deleteFolder(confirmingDelete.id);
        });
        trackEvent("folder_deleted", { success: true });
        showSuccess(`Folder "${confirmingDelete.name}" deleted`);
        if (selectedFolderId === confirmingDelete.id) {
          setSelectedFolderId(null);
          setViewLevel("environment");
        }
      } else if (confirmingDelete.type === "secret") {
        await runTask(`Deleting secret "${confirmingDelete.name}"...`, async () => {
          await deleteSecret(confirmingDelete.id);
        });
        trackEvent("secret_deleted", { success: true });
        showSuccess(`Secret "${confirmingDelete.name}" deleted`);
      }
      setConfirmingDelete(null);
    } catch {
      trackEvent(`${confirmingDelete?.type}_deleted`, { success: false });
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleAddCollaborator = async (email: string, confirmPayment?: boolean) => {
    if (isAddingCollaborator) return;
    setIsAddingCollaborator(true);
    setPendingCollaboratorEmail(email);

    try {
      if (confirmPayment) {
        const result = await continueTask(async () => {
          return await shareProject(email, true);
        });

        setPendingCollaboratorEmail(null);

        if (!result) {
          setConfirmationModal({ visible: false, type: "seat", balance: 0 });
          return;
        }

        logger.debug("shareProject result (confirmed):", JSON.stringify(result, null, 2));

        if (result.success) {
          trackEvent("collaborator_added", { success: true, confirmed_payment: true });
          showSuccess(`Collaborator "${email}" added`);
          setConfirmationModal({ visible: false, type: "seat", balance: 0 });
          refetchProjectData();
        } else if (result.requiresProPlan) {
          setConfirmationModal({ visible: false, type: "seat", balance: 0 });
          if (result.checkoutUrl) {
            setCheckoutModal({
              visible: true,
              url: result.checkoutUrl,
              reason: "pro_required",
            });
          } else {
            showError(result.message || "Pro plan required");
          }
        } else if (result.requiresAdditionalShare) {
          setConfirmationModal({ visible: false, type: "seat", balance: 0 });
          if (result.checkoutUrl) {
            setCheckoutModal({
              visible: true,
              url: result.checkoutUrl,
              reason: "share_limit",
            });
          } else {
            logger.error("Checkout URL is null:", result);
            showError(
              result.message ||
                "Unable to create checkout session. Please try again or contact support.",
            );
          }
        } else if (result.paymentFailed && result.billingPortalUrl) {
          setConfirmationModal({ visible: false, type: "seat", balance: 0 });
          setBillingPortalModal({
            visible: true,
            url: result.billingPortalUrl,
          });
        } else if (result.paymentFailed) {
          showError(result.message || "Payment failed. Please update your billing settings.");
        } else if (result.message) {
          showError(result.message);
        }
        return;
      }

      setTaskPending(`Adding collaborator "${email}"...`);

      const result = await shareProject(email, false);

      if (!result) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        return;
      }

      logger.debug("shareProject result:", JSON.stringify(result, null, 2));

      if (result.success) {
        trackEvent("collaborator_added", { success: true });
        showSuccess(`Collaborator "${email}" added`);
        setPendingCollaboratorEmail(null);
        setConfirmationModal({ visible: false, type: "seat", balance: 0 });
        refetchProjectData();
      } else if (result.requiresConfirmation) {
        setConfirmationModal({
          visible: true,
          type: "seat",
          email,
          balance: result.balance ?? 0,
        });
      } else if (result.requiresProPlan) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        if (result.checkoutUrl) {
          setCheckoutModal({
            visible: true,
            url: result.checkoutUrl,
            reason: "pro_required",
          });
        } else {
          showError(result.message || "Pro plan required");
        }
      } else if (result.requiresAdditionalShare) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        if (result.checkoutUrl) {
          setCheckoutModal({
            visible: true,
            url: result.checkoutUrl,
            reason: "share_limit",
          });
        } else {
          logger.error("Checkout URL is null:", result);
          showError(
            result.message ||
              "Unable to create checkout session. Please try again or contact support.",
          );
        }
      } else if (result.paymentFailed && result.billingPortalUrl) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        setBillingPortalModal({
          visible: true,
          url: result.billingPortalUrl,
        });
      } else if (result.paymentFailed) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        showError(result.message || "Payment failed. Please update your billing settings.");
      } else if (result.message) {
        cancelTask();
        setPendingCollaboratorEmail(null);
        showError(result.message);
      }
    } catch (error) {
      cancelTask();
      setPendingCollaboratorEmail(null);
      showError(extractErrorMessage(error));
    } finally {
      setIsAddingCollaborator(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (confirmationModal.email) {
      await handleAddCollaborator(confirmationModal.email, true);
    }
  };

  const handleCancelPayment = () => {
    cancelTask();
    setConfirmationModal({ visible: false, type: "seat", balance: 0 });
    setPendingCollaboratorEmail(null);
  };

  const handleRevokeCollaborator = async (collab: SharedUser) => {
    if (isRevokingCollaborator) return;
    setIsRevokingCollaborator(true);
    try {
      await runTask(`Revoking ${collab.email}...`, async () => {
        await revokeShare(collab.id);
      });
      trackEvent("collaborator_revoked", { success: true, with_rotation: false });
      showSuccess(`${collab.email} revoked`);
      refetchProjectData();
    } catch (error) {
      trackEvent("collaborator_revoked", { success: false });
      logger.debug("Revoke collaborator failed:", error);
      showError(extractErrorMessage(error));
    } finally {
      setIsRevokingCollaborator(false);
    }
  };

  const handleRevokeCollaboratorWithRotation = async (collab: SharedUser) => {
    if (isRevokingWithRotation) return;
    setIsRevokingWithRotation(true);
    try {
      await runTask(`Revoking ${collab.email} and rotating keys...`, async () => {
        await revokeShareWithRotation(collab.id, sharedUsers);
      });
      trackEvent("collaborator_revoked", { success: true, with_rotation: true });
      showSuccess(`${collab.email} revoked and keys rotated`);
      refetchProjectData();
    } catch (error) {
      trackEvent("collaborator_revoked", { success: false });
      logger.debug("Revoke with rotation failed:", error);
      showError(extractErrorMessage(error));
    } finally {
      setIsRevokingWithRotation(false);
    }
  };

  const handleToggleSecrets = () => {
    if (showSecrets) {
      setShowSecrets(false);
    } else if (isSessionUnlocked) {
      setShowSecrets(true);
    } else {
      setPendingAction("toggle");
      setShowPasswordModal(true);
      setPasswordError(null);
    }
  };

  const handlePasswordVerify = async (password: string) => {
    if (isVerifyingPassword) return;
    setIsVerifyingPassword(true);
    setPasswordError(null);

    try {
      const isValid = await verifyPassword(password);
      if (isValid) {
        setIsSessionUnlocked(true);
        setShowPasswordModal(false);
        setPasswordError(null);

        if (pendingAction === "toggle") {
          setShowSecrets(true);
        } else if (pendingAction === "editor") {
          openBulkImport();
        }
        setPendingAction(null);
      } else {
        setPasswordError("Incorrect password");
      }
    } catch (error) {
      setPasswordError("Failed to verify password");
      logger.debug("Password verification failed:", error);
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handlePasswordModalClose = () => {
    setShowPasswordModal(false);
    setPasswordError(null);
    setPendingAction(null);
  };

  const handleOpenEditor = () => {
    if (isSessionUnlocked) {
      openBulkImport();
    } else {
      setPendingAction("editor");
      setShowPasswordModal(true);
      setPasswordError(null);
    }
  };

  const getAllCommands = () => {
    const cmds = [];
    if (viewLevel === "environments") {
      cmds.push({
        key: "n",
        description: "Create environment",
        category: "Create",
        disabled: isRestricted,
      });
      cmds.push({
        key: "u",
        description: "Rename environment",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({
        key: "d",
        description: "Delete environment",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({ key: "g", description: "Open dashboard", category: "Navigate" });
      cmds.push({ key: "esc", description: "Back to home", category: "Navigate" });
    } else if (viewLevel === "environment") {
      cmds.push({
        key: "n",
        description: "Create folder",
        category: "Create",
        disabled: isRestricted,
      });
      const item = items[selectedIndex];
      if (item?.type === "folder")
        cmds.push({
          key: "u",
          description: "Rename folder",
          category: "Manage",
          disabled: isRestricted,
        });
      cmds.push({
        key: "⌥i",
        description: "Edit secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({
        key: "d",
        description: "Delete",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({ key: "g", description: "Open dashboard", category: "Navigate" });
      cmds.push({ key: "esc", description: "Go back", category: "Navigate" });
    } else {
      cmds.push({
        key: "⌥i",
        description: "Edit secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({
        key: "d",
        description: "Delete secret",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({ key: "g", description: "Open dashboard", category: "Navigate" });
      cmds.push({ key: "esc", description: "Go back", category: "Navigate" });
    }
    cmds.push({
      key: "c",
      description: "Manage collaborators",
      category: "Manage",
      disabled: isRestricted,
    });
    if (viewLevel !== "environments")
      cmds.push({
        key: "v",
        description: showSecrets ? "Hide secrets" : "Show secrets",
        category: "View",
      });
    return cmds.sort(
      (a, b) =>
        ["Navigate", "Create", "Manage", "View"].indexOf(a.category) -
        ["Navigate", "Create", "Manage", "View"].indexOf(b.category),
    );
  };

  const executeCommand = (cmd: { key: string }) => {
    if (isRestricted && ["n", "u", "c", "⌥i", "⌥u"].includes(cmd.key)) return;
    switch (cmd.key) {
      case "n":
        setCreatingItem(viewLevel === "environments" ? "env" : "folder");
        break;
      case "u": {
        if (viewLevel === "environments") {
          const env = environments[selectedIndex];
          if (env) setEditingItem({ type: "env", id: env.id, name: env.name });
        } else if (viewLevel === "environment") {
          const item = items[selectedIndex];
          if (item?.type === "folder")
            setEditingItem({ type: "folder", id: item.id, name: item.name });
        }
        break;
      }
      case "esc":
        goBack();
        break;
      case "⌥i":
      case "⌥u":
        handleOpenEditor();
        break;
      case "c":
        setActiveModal("manageCollaborators");
        break;
      case "v":
        handleToggleSecrets();
        break;
      case "g": {
        open(DASHBOARD_URL);
        break;
      }
    }
  };

  const openBulkImport = () => {
    const secretItems = items.filter((i) => i.type === "secret");

    if (secretItems.length === 0) {
      bulkImportInput.setValue("# Add your secrets here\nAPI_KEY=your_key_here");
      setBulkImportScopes(new Map());
    } else {
      const scopeMap = new Map<string, string>();
      const secretsJson = JSON.stringify(
        secretItems.map((i) => {
          const secretItem = i as { value?: string; secretType?: string; secretScope?: string };
          const scope = secretItem.secretScope || "shared";
          scopeMap.set(i.name, scope);
          return {
            key: i.name,
            value: secretItem.value || "",
            type: secretItem.secretType || "string",
            scope,
          };
        }),
        null,
        2,
      );
      setBulkImportScopes(scopeMap);
      const envContent = jsonToEnv(secretsJson);
      bulkImportInput.setValue(envContent || "");
    }

    setBulkImportFormat("env");
    setActiveModal("bulkImport");
  };

  useKeyboard((key) => {
    if (showProSuccess) {
      if (key.name === "escape" || key.name === "return") {
        setShowProSuccess(false);
      }
      return;
    }

    if (creatingItem || editingItem) return;

    if (confirmationModal.visible || checkoutModal.visible || billingPortalModal.visible) return;

    if (showPasswordModal) {
      if (key.name === "escape") {
        handlePasswordModalClose();
      }
      return;
    }

    if (
      isProcessing ||
      isAddingCollaborator ||
      isRevokingCollaborator ||
      isRevokingWithRotation ||
      isCreatingItem ||
      isRenamingItem ||
      isDeletingItem ||
      isVerifyingPassword
    )
      return;

    if (activeModal === "bulkImport") {
      if (key.name === "escape") {
        setActiveModal("none");
        bulkImportInput.reset();
        return;
      }
      if (key.name === "j" && key.meta) {
        const content = bulkImportInput.value.trim();
        if (bulkImportFormat === "env" && content) {
          const json = envToJson(content, bulkImportScopes);
          if (json && json !== "[]") {
            bulkImportInput.setValue(json);
            setBulkImportFormat("json");
          }
        } else if (content) {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              const updatedScopes = new Map(bulkImportScopes);
              for (const item of parsed) {
                if (item?.key && item?.scope) {
                  updatedScopes.set(item.key, item.scope);
                }
              }
              setBulkImportScopes(updatedScopes);
            }
          } catch {
            // ignore parse errors
          }
          const env = jsonToEnv(content);
          if (env) {
            bulkImportInput.setValue(env);
            setBulkImportFormat("env");
          }
        }
        return;
      }
      if ((key.name === "s" || key.name === "return") && key.meta) {
        const trimmed = bulkImportInput.value.trim();
        if (!trimmed) return;
        if (!selectedEnvId || !project) return;

        try {
          const parsed =
            bulkImportFormat === "env" ? parseEnvContent(trimmed) : JSON.parse(trimmed);
          const result = validateBulkImportJson(parsed);
          if (!result.valid || result.secrets.length === 0) return;

          (async () => {
            try {
              await runTask(`Saving ${result.secrets.length} secrets...`, async () => {
                const relevantSecrets =
                  viewLevel === "folder" && selectedFolderId
                    ? secrets.filter((s) => s.folderId === selectedFolderId)
                    : secrets.filter((s) => s.environmentId === selectedEnvId && !s.folderId);

                const keyToSecretId = new Map(relevantSecrets.map((s) => [s.key, s.id]));

                await updateSecretBulk({
                  environmentId: selectedEnvId,
                  folderId: viewLevel === "folder" ? selectedFolderId || undefined : undefined,
                  secrets: result.secrets.map((s) => ({
                    secretId: s.secretId || keyToSecretId.get(s.key),
                    key: s.key,
                    value: String(s.value),
                    valueType: s.type,
                    scope: (s.scope || bulkImportScopes.get(s.key) || "shared") as
                      | "client"
                      | "server"
                      | "shared",
                  })),
                  mode: "overwrite",
                });

                const removedKeys = computeRemovedKeys(
                  relevantSecrets.map((s) => s.key),
                  result.secrets.map((s) => s.key),
                );
                for (const key of removedKeys) {
                  const secretId = keyToSecretId.get(key);
                  if (secretId) await deleteSecret(secretId);
                }
              });
              const removedCount = computeRemovedKeys(
                secrets
                  .filter(
                    viewLevel === "folder" && selectedFolderId
                      ? (s) => s.folderId === selectedFolderId
                      : (s) => s.environmentId === selectedEnvId && !s.folderId,
                  )
                  .map((s) => s.key),
                result.secrets.map((s) => s.key),
              ).length;
              trackEvent("bulk_import_completed", {
                count: result.secrets.length,
                deleted: removedCount,
                success: true,
              });
              const msg =
                removedCount > 0
                  ? `${result.secrets.length} secrets saved, ${removedCount} removed`
                  : `${result.secrets.length} secrets saved`;
              showSuccess(msg);
              setActiveModal("none");
              bulkImportInput.reset();
            } catch (error) {
              trackEvent("bulk_import_completed", { success: false });
              logger.debug("Bulk import save failed:", error);
            }
          })();
        } catch (error) {
          logger.debug("Bulk import parse failed:", error);
        }
        return;
      }
      bulkImportInput.handleKey(key);
      return;
    }

    if (activeModal === "commandPalette" || activeModal === "manageCollaborators") return;

    if (confirmingDelete) {
      if (key.name === "y") handleDeleteItem();
      else if (key.name === "n" || key.name === "escape") setConfirmingDelete(null);
      return;
    }

    if (key.name === "g" && !key.meta && !key.ctrl) {
      open(DASHBOARD_URL);
      return;
    }

    if (key.name === "escape" || key.name === "backspace") {
      goBack();
      setConfirmingDelete(null);
    } else if (key.name === "k" || key.name === "up") {
      moveUp();
      setConfirmingDelete(null);
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
      setConfirmingDelete(null);
    } else if (key.name === "return" || key.name === "l" || key.name === "right") enter();
    else if (key.name === "d" && !isRestricted) {
      const item = items[selectedIndex];
      if (item)
        setConfirmingDelete({
          type: item.type as "env" | "folder" | "secret",
          id: item.id,
          name: item.name,
        });
    } else if (key.name === "n" && !key.meta && !isRestricted)
      setCreatingItem(
        viewLevel === "environments" ? "env" : viewLevel === "environment" ? "folder" : null,
      );
    else if (key.name === "u" && !key.meta && !isRestricted) {
      if (viewLevel === "environments") {
        const env = environments[selectedIndex];
        if (env) setEditingItem({ type: "env", id: env.id, name: env.name });
      } else if (viewLevel === "environment") {
        const item = items[selectedIndex];
        if (item?.type === "folder")
          setEditingItem({ type: "folder", id: item.id, name: item.name });
      }
    } else if (
      (key.name === "i" || key.name === "u") &&
      key.meta &&
      !isRestricted &&
      viewLevel !== "environments"
    )
      handleOpenEditor();
    else if (key.name === "c" && !isRestricted) setActiveModal("manageCollaborators");
    else if (key.name === "v") handleToggleSecrets();
    else if (key.sequence === "?") setActiveModal("commandPalette");
  });

  const getShortcuts = () => {
    const isDisabled =
      isProcessing ||
      isAddingCollaborator ||
      isRevokingCollaborator ||
      isRevokingWithRotation ||
      isCreatingItem ||
      isRenamingItem ||
      isDeletingItem;

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
    const shortcuts = [];
    if (viewLevel === "environments") {
      shortcuts.push(
        { key: "n", description: "create environment", disabled: isDisabled || isRestricted },
        { key: "u", description: "rename environment", disabled: isDisabled || isRestricted },
      );
    } else if (viewLevel === "environment") {
      shortcuts.push(
        { key: "n", description: "create folder", disabled: isDisabled || isRestricted },
        { key: "⌥i", description: "edit secrets", disabled: isDisabled || isRestricted },
      );
      const item = items[selectedIndex];
      if (item?.type !== "secret")
        shortcuts.push({
          key: "u",
          description: "rename folder",
          disabled: isDisabled || isRestricted,
        });
    } else {
      shortcuts.push({
        key: "⌥i",
        description: "edit secrets",
        disabled: isDisabled || isRestricted,
      });
    }
    return { primary: [{ shortcuts }], secondary: [] };
  };

  const getTypeIndicator = (type: "env" | "folder" | "secret") => {
    if (type === "env") return { prefix: "[E]", color: THEME_COLORS.secondary };
    if (type === "folder") return { prefix: "[/]", color: THEME_COLORS.accent };
    return { prefix: "[*]", color: THEME_COLORS.success };
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

          <box
            flexDirection="column"
            width={66}
            height={
              items.length === 0 && !creatingItem
                ? 1
                : Math.min(
                    items.length + (creatingItem ? 1 : 0) + (confirmingDelete ? 1 : 0),
                    PAGE_SIZE + (confirmingDelete ? 1 : 0),
                  ) +
                  (scrollOffset > 0 ? 1 : 0) +
                  (scrollOffset + PAGE_SIZE < items.length ? 1 : 0)
            }
          >
            {items.length === 0 && !creatingItem ? (
              <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
            ) : (
              <>
                {scrollOffset > 0 && (
                  <text fg={THEME_COLORS.textDim}>
                    {"  "}... {scrollOffset} more item{scrollOffset > 1 ? "s" : ""} above
                  </text>
                )}
                {items.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((item, index) => {
                  const actualIndex = index + scrollOffset;
                  const isSelected = actualIndex === selectedIndex && !creatingItem && !editingItem;
                  const isEditing = editingItem?.id === item.id;
                  const canEnter = item.type !== "secret";
                  const indicator = getTypeIndicator(item.type);

                  return (
                    <box key={item.id} flexDirection="column">
                      {isEditing ? (
                        <InlineInput
                          active={true}
                          initialValue={item.name}
                          onSubmit={handleRenameItem}
                          onCancel={() => setEditingItem(null)}
                          maxWidth={50}
                          maxLength={30}
                          width={66}
                          icon="[~]"
                          iconColor={THEME_COLORS.accent}
                        />
                      ) : (
                        <box height={1} width={66}>
                          <text>
                            <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                              {isSelected && canEnter ? "› " : "  "}
                            </span>
                            <span fg={indicator.color}>{indicator.prefix}</span>
                            <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                              {" "}
                              {item.name}
                            </span>
                            {item.type === "secret" &&
                              (() => {
                                const secretItem = item as { value: string; secretType?: string };
                                const secretType = secretItem.secretType || "string";
                                const value = showSecrets ? secretItem.value || "" : "********";
                                const maxLen =
                                  66 - 6 - item.name.length - 2 - secretType.length - 3;
                                const display =
                                  value.length > maxLen
                                    ? `${value.slice(0, maxLen - 3)}...`
                                    : value;
                                return (
                                  <>
                                    <span fg={THEME_COLORS.textDim}>: </span>
                                    <span fg={THEME_COLORS.secondary}>{secretType}</span>
                                    <span fg={THEME_COLORS.textDim}> = </span>
                                    <span fg={THEME_COLORS.accent}>{display}</span>
                                  </>
                                );
                              })()}
                          </text>
                        </box>
                      )}
                      <DeleteConfirmation
                        itemType={
                          viewLevel === "environments"
                            ? "environment"
                            : item.type === "folder"
                              ? "folder"
                              : "secret"
                        }
                        itemName={item.name}
                        visible={confirmingDelete?.id === item.id}
                      />
                    </box>
                  );
                })}
                {creatingItem && (
                  <InlineInput
                    active={true}
                    onSubmit={handleCreateItem}
                    onCancel={() => setCreatingItem(null)}
                    maxWidth={50}
                    maxLength={30}
                    width={66}
                    placeholder={
                      creatingItem === "env" ? "e.g. production, staging" : "e.g. database, auth"
                    }
                  />
                )}
                {scrollOffset + PAGE_SIZE < items.length && (
                  <text fg={THEME_COLORS.textDim}>
                    {"  "}... {items.length - (scrollOffset + PAGE_SIZE)} more item
                    {items.length - (scrollOffset + PAGE_SIZE) > 1 ? "s" : ""} below
                  </text>
                )}
              </>
            )}
          </box>

          <box flexDirection="column" marginTop={1}>
            <box height={1} width={66} flexDirection="row" justifyContent="space-between">
              <text fg={THEME_COLORS.textDim}>Collaborators [{sharedUsers.length}]</text>
              <text fg={THEME_COLORS.textDim}>
                {viewLevel === "environments" && `${environments.length} environments`}
                {viewLevel === "environment" &&
                  `${folders.filter((f) => f.environmentId === selectedEnvId).length} folders · ${secrets.filter((s) => s.environmentId === selectedEnvId && !s.folderId).length} secrets`}
                {viewLevel === "folder" &&
                  `${secrets.filter((s) => s.folderId === selectedFolderId).length} secrets`}
              </text>
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
        onAdd={handleAddCollaborator}
        onRevoke={handleRevokeCollaborator}
        onRevokeWithRotation={handleRevokeCollaboratorWithRotation}
        onClose={() => setActiveModal("none")}
        pendingEmail={pendingCollaboratorEmail}
        shareLimits={shareLimits}
      />

      <CheckoutRedirectModal
        visible={checkoutModal.visible}
        checkoutUrl={checkoutModal.url}
        reason={checkoutModal.reason}
        onClose={() => {
          setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
        }}
      />

      <Modal
        visible={showProSuccess}
        title="Welcome to Pro!"
        width={50}
        shortcuts={[{ key: "esc", description: "close" }]}
      >
        <box flexDirection="column" gap={1}>
          <text fg={THEME_COLORS.success}>You're now a PRO member!</text>
          <text fg={THEME_COLORS.text}>Unlimited projects and sharing unlocked.</text>
        </box>
      </Modal>

      <ConfirmPaymentModal
        visible={confirmationModal.visible}
        type={confirmationModal.type}
        itemName={confirmationModal.email}
        balance={confirmationModal.balance}
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelPayment}
      />

      <BillingPortalModal
        visible={billingPortalModal.visible}
        portalUrl={billingPortalModal.url}
        onClose={() => setBillingPortalModal({ visible: false, url: "" })}
      />

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={getAllCommands()}
        onExecute={executeCommand}
        onClose={() => setActiveModal("none")}
      />

      <BulkImportModal
        visible={activeModal === "bulkImport"}
        content={bulkImportInput.value}
        cursor={bulkImportInput.cursor}
        format={bulkImportFormat}
        collisions={bulkImportCollisions}
        cursorVisible={true}
        onClose={() => {
          setActiveModal("none");
          bulkImportInput.reset();
        }}
      />

      <Modal visible={showPasswordModal} title="Enter Password" width={50} height={12}>
        <PasswordInput
          mode="verify"
          onSubmit={handlePasswordVerify}
          onCancel={handlePasswordModalClose}
          width={46}
          disabled={isVerifyingPassword}
          error={passwordError}
        />
      </Modal>
    </box>
  );
}
