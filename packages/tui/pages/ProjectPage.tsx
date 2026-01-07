import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { InlineInput } from "../components/forms/InlineInput";
import {
  BulkImportModal,
  CommandPaletteModal,
  ManageCollaboratorsModal,
} from "../components/modals";
import { DeleteConfirmation } from "../components/shared/DeleteConfirmation";
import { GuideBar } from "../components/shared/GuideBar";
import { useMultilineInput } from "../hooks/useMultilineInput";
import { usePaste } from "../hooks/usePaste";
import { useTaskQueue } from "../hooks/useTaskQueue";
import { useRouter } from "../router";
import type {
  Environment,
  Folder,
  LogEntry,
  ModalType,
  ProjectStatus,
  Secret,
  SharedUser,
  ViewLevel,
} from "../types";
import type { BulkImportFormat, CollisionInfo } from "../utils/bulkImportTypes";
import { validateBulkImportJson } from "../utils/bulkImportValidator";
import { KEY_SYMBOLS, STATUS_COLORS, THEME_COLORS } from "../utils/constants";
import { parseEnvContent } from "../utils/envParser";
import { envToJson, jsonToEnv } from "../utils/formatConverter";

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
}

// Mock data (will be replaced with real API)
const MOCK_ENVIRONMENTS: Environment[] = [
  { id: "env1", name: "production" },
  { id: "env2", name: "staging" },
  { id: "env3", name: "development" },
];

const MOCK_FOLDERS: Folder[] = [
  { id: "f1", name: "database", environmentId: "env1" },
  { id: "f2", name: "auth", environmentId: "env1" },
  { id: "f3", name: "api", environmentId: "env2" },
];

const MOCK_SECRETS: Secret[] = [
  {
    id: "s1",
    key: "DATABASE_URL",
    value: "postgresql://user:pass@localhost:5432/db",
    type: "string",
    environmentId: "env1",
  },
  {
    id: "s2",
    key: "API_KEY",
    value: "sk_test_4eC39HqLyjWDarjtT1zdp7dc",
    type: "string",
    environmentId: "env1",
  },
  {
    id: "s3",
    key: "JWT_SECRET",
    value: "a-very-secret-signing-key",
    type: "string",
    environmentId: "env1",
    folderId: "f1",
  },
  {
    id: "s4",
    key: "SMTP_PASSWORD",
    value: "pass123",
    type: "string",
    environmentId: "env1",
    folderId: "f1",
  },
  {
    id: "s5",
    key: "AWS_ACCESS_KEY",
    value: "AKIAIOSFODNN7EXAMPLE",
    type: "string",
    environmentId: "env1",
  },
  {
    id: "s6",
    key: "REDIS_URL",
    value: "redis://localhost:6379",
    type: "string",
    environmentId: "env1",
  },
  { id: "s7", key: "STRIPE_KEY", value: "sk_test_51Mz...", type: "string", environmentId: "env2" },
  { id: "s8", key: "MAX_CONNECTIONS", value: "100", type: "number", environmentId: "env1" },
  { id: "s9", key: "DEBUG_MODE", value: "true", type: "boolean", environmentId: "env1" },
];

const MOCK_SHARED_USERS: SharedUser[] = [
  { id: "u1", email: "john@example.com", name: "John" },
  { id: "u2", email: "jane@example.com", name: "Jane" },
];

const MOCK_LOGS: LogEntry[] = [
  { id: "l1", action: "secret.created", timestamp: Date.now() - 3600000, user: "you" },
  { id: "l2", action: "folder.created", timestamp: Date.now() - 7200000, user: "john@example.com" },
];

const PAGE_SIZE = 10;

export function ProjectPage({
  projectId: _projectId,
  projectName,
  projectStatus,
}: ProjectPageProps) {
  const { width, height } = useTerminalDimensions();
  const { goBack: routerGoBack } = useRouter();
  const { runTask, showSuccess } = useTaskQueue();

  // Data state (will come from API)
  const [environments] = useState<Environment[]>(MOCK_ENVIRONMENTS);
  const [folders] = useState<Folder[]>(MOCK_FOLDERS);
  const [secrets] = useState<Secret[]>(MOCK_SECRETS);
  const [sharedUsers] = useState<SharedUser[]>(MOCK_SHARED_USERS);
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);

  // Navigation state
  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);

  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>("none");

  // Inline editing state
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

  // Bulk import state
  const bulkImportInput = useMultilineInput({ maxLines: 50 });
  const [bulkImportFormat, setBulkImportFormat] = useState<BulkImportFormat>("env");
  const [bulkImportCollisions, setBulkImportCollisions] = useState<CollisionInfo[]>([]);
  const [bulkImportMode, setBulkImportMode] = useState<"import" | "update">("import");

  const isRestricted = projectStatus === "restricted" || projectStatus === "archived";

  // Computed values
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
        }));
    }
    return [];
  }, [viewLevel, selectedEnvId, selectedFolderId, environments, folders, secrets]);

  const items = getCurrentItems();

  // Bulk import collision detection
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

  // Paste handler for bulk import
  usePaste((text) => {
    if (activeModal === "bulkImport") {
      bulkImportInput.handlePaste(text);
    }
  });

  // Navigation
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

  const enter = () => {
    const item = items[selectedIndex];
    if (!item) return;
    if (item.type === "env") {
      setSelectedEnvId(item.id);
      setViewLevel("environment");
      setSelectedIndex(0);
      setScrollOffset(0);
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

  // Action handlers
  const handleCreateItem = async (name: string) => {
    if (!creatingItem) return;
    const itemType = creatingItem === "env" ? "environment" : "folder";
    await runTask(
      `Creating ${itemType} "${name}"...`,
      () => new Promise((r) => setTimeout(r, 1000)),
    );
    showSuccess(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} "${name}" created`);
    setCreatingItem(null);
  };

  const handleRenameItem = async (name: string) => {
    if (!editingItem || name === editingItem.name) {
      setEditingItem(null);
      return;
    }
    const itemType = editingItem.type === "env" ? "environment" : "folder";
    await runTask(
      `Renaming ${itemType} to "${name}"...`,
      () => new Promise((r) => setTimeout(r, 1000)),
    );
    showSuccess(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} renamed to "${name}"`);
    setEditingItem(null);
  };

  const handleDeleteItem = async () => {
    if (!confirmingDelete) return;
    const itemType = confirmingDelete.type === "env" ? "environment" : confirmingDelete.type;
    await runTask(
      `Deleting ${itemType} "${confirmingDelete.name}"...`,
      () => new Promise((r) => setTimeout(r, 1000)),
    );
    showSuccess(`${confirmingDelete.name} deleted`);
    setConfirmingDelete(null);
  };

  const handleAddCollaborator = async (email: string) => {
    await runTask(
      `Adding collaborator "${email}"...`,
      () => new Promise((r) => setTimeout(r, 1000)),
    );
    showSuccess(`Collaborator "${email}" added`);
  };

  const handleRevokeCollaborator = async (collab: SharedUser) => {
    await runTask(`Revoking ${collab.email}...`, () => new Promise((r) => setTimeout(r, 1000)));
    showSuccess(`${collab.email} revoked`);
  };

  // Commands
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
        key: "⌥u",
        description: "Update secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({
        key: "⌥i",
        description: "Import secrets",
        category: "Create",
        disabled: isRestricted,
      });
      cmds.push({ key: "esc", description: "Go back", category: "Navigate" });
    } else {
      cmds.push({
        key: "⌥u",
        description: "Update secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      cmds.push({
        key: "⌥i",
        description: "Import secrets",
        category: "Create",
        disabled: isRestricted,
      });
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
        openBulkImport("import");
        break;
      case "⌥u":
        openBulkImport("update");
        break;
      case "c":
        setActiveModal("manageCollaborators");
        break;
      case "v":
        setShowSecrets((p) => !p);
        break;
    }
  };

  const openBulkImport = (mode: "import" | "update") => {
    if (mode === "import") {
      bulkImportInput.setValue("# Paste your .env file here\nAPI_KEY=your_key_here");
      setBulkImportFormat("env");
    } else {
      const secretsJson = JSON.stringify(
        items
          .filter((i) => i.type === "secret")
          .map((i) => ({
            key: i.name,
            value: (i as { value?: string }).value || "",
            type: "string",
            scope: "shared",
          })),
        null,
        2,
      );
      bulkImportInput.setValue(secretsJson);
      setBulkImportFormat("json");
    }
    setBulkImportMode(mode);
    setActiveModal("bulkImport");
  };

  // Main keyboard handler
  useKeyboard((key) => {
    // Skip if inline editing is active
    if (creatingItem || editingItem) return;

    // Bulk import modal
    if (activeModal === "bulkImport") {
      if (key.name === "escape") {
        setActiveModal("none");
        bulkImportInput.reset();
        return;
      }
      if (key.name === "j" && key.meta) {
        const content = bulkImportInput.value.trim();
        if (bulkImportFormat === "env" && content) {
          const json = envToJson(content);
          if (json && json !== "[]") {
            bulkImportInput.setValue(json);
            setBulkImportFormat("json");
          }
        } else if (content) {
          const env = jsonToEnv(content);
          if (env) {
            bulkImportInput.setValue(env);
            setBulkImportFormat("env");
          }
        }
        return;
      }
      if ((key.name === "i" || key.name === "o") && key.meta) {
        const trimmed = bulkImportInput.value.trim();
        if (!trimmed) return;
        try {
          const parsed =
            bulkImportFormat === "env" ? parseEnvContent(trimmed) : JSON.parse(trimmed);
          const result = validateBulkImportJson(parsed);
          if (!result.valid || result.secrets.length === 0) return;
          const action = key.name === "o" ? "overwriting" : "skipping";
          runTask(
            `Importing secrets (${action} collisions)...`,
            () => new Promise((r) => setTimeout(r, 1000)),
          );
          showSuccess(`${result.secrets.length} secrets imported`);
          setActiveModal("none");
          bulkImportInput.reset();
        } catch {
          /* ignore */
        }
        return;
      }
      bulkImportInput.handleKey(key);
      return;
    }

    // Other modals handled by smart components
    if (activeModal === "commandPalette" || activeModal === "manageCollaborators") return;

    // Delete confirmation
    if (confirmingDelete) {
      if (key.name === "y") handleDeleteItem();
      else if (key.name === "n" || key.name === "escape") setConfirmingDelete(null);
      return;
    }

    // Navigation & actions
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
    } else if (key.name === "n" && !isRestricted)
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
    } else if (key.name === "i" && key.meta && !isRestricted && viewLevel !== "environments")
      openBulkImport("import");
    else if (key.name === "u" && key.meta && !isRestricted && viewLevel !== "environments")
      openBulkImport("update");
    else if (key.name === "c" && !isRestricted) setActiveModal("manageCollaborators");
    else if (key.name === "v") setShowSecrets((p) => !p);
    else if (key.sequence === "?") setActiveModal("commandPalette");
  });

  // Dynamic shortcuts
  const getShortcuts = () => {
    if (creatingItem || editingItem) {
      return {
        primary: [
          {
            shortcuts: [
              { key: KEY_SYMBOLS.enter, description: creatingItem ? "create" : "save" },
              { key: "esc", description: "cancel" },
            ],
          },
        ],
        secondary: [],
      };
    }
    const shortcuts = [];
    if (viewLevel === "environments")
      shortcuts.push(
        { key: "n", description: "create environment", disabled: isRestricted },
        { key: "u", description: "rename environment", disabled: isRestricted },
      );
    else if (viewLevel === "environment") {
      shortcuts.push({ key: "n", description: "create folder", disabled: isRestricted });
      const item = items[selectedIndex];
      if (item?.type !== "secret")
        shortcuts.push({ key: "u", description: "rename folder", disabled: isRestricted });
      if (item?.type === "secret")
        shortcuts.push({ key: "⌥u", description: "update secrets", disabled: isRestricted });
      shortcuts.push(
        { key: "⌥i", description: "import secrets", disabled: isRestricted },
        { key: "esc", description: "back" },
      );
    } else {
      shortcuts.push(
        { key: "⌥u", description: "update secrets", disabled: isRestricted },
        { key: "⌥i", description: "import secrets", disabled: isRestricted },
      );
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
          width={70}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          {/* Breadcrumb */}
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

          {/* Item list */}
          <box
            flexDirection="column"
            width={66}
            height={
              items.length === 0 && !creatingItem
                ? 1
                : Math.min(
                    items.length + (creatingItem ? 1 : 0) + (confirmingDelete ? 1 : 0),
                    PAGE_SIZE + (confirmingDelete ? 1 : 0),
                  )
            }
          >
            {items.length === 0 && !creatingItem ? (
              <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
            ) : (
              <>
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
              </>
            )}
          </box>

          {/* Footer info */}
          <box flexDirection="column" marginTop={1}>
            {viewLevel === "environments" && logs.length > 0 && (
              <box height={1} width={66}>
                <text fg={THEME_COLORS.textDim}>
                  Latest Pulse:{" "}
                  <span fg={THEME_COLORS.textMuted}>
                    {logs[0].user} {logs[0].action.replace(".", " ")}
                  </span>
                </text>
              </box>
            )}
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

          {/* Guide bar */}
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

      {/* Modals */}
      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        projectName={projectName}
        collaborators={sharedUsers}
        onAdd={handleAddCollaborator}
        onRevoke={handleRevokeCollaborator}
        onRevokeWithRotation={handleRevokeCollaborator}
        onClose={() => setActiveModal("none")}
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
        mode={bulkImportMode}
        onClose={() => {
          setActiveModal("none");
          bulkImportInput.reset();
        }}
      />
    </box>
  );
}
