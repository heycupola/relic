import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useMultilineInput } from "../../hooks/useMultilineInput";
import { usePaste } from "../../hooks/usePaste";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type {
  Environment,
  Folder,
  LogEntry,
  ModalType,
  ProjectStatus,
  Secret,
  SharedUser,
  ViewLevel,
} from "../../types";
import type { BulkImportFormat, CollisionInfo } from "../../utils/bulkImportTypes";
import { validateBulkImportJson } from "../../utils/bulkImportValidator";
import { STATUS_COLORS, THEME_COLORS } from "../../utils/constants";
import { parseEnvContent } from "../../utils/envParser";
import { envToJson, jsonToEnv } from "../../utils/formatConverter";
import { InlineInput } from "../forms/InlineInput";
import { BulkImportModal, CommandPaletteModal, ManageCollaboratorsModal } from "../modals";
import { DeleteConfirmation } from "../shared/DeleteConfirmation";
import { GuideBar } from "../shared/GuideBar";

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  onBack: () => void;
}

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

export function ProjectPage({
  projectId: _projectId,
  projectName,
  projectStatus,
  onBack,
}: ProjectPageProps) {
  const { width, height } = useTerminalDimensions();
  const { runTask, showSuccess } = useTaskQueue();

  const [environments] = useState<Environment[]>(MOCK_ENVIRONMENTS);
  const [folders] = useState<Folder[]>(MOCK_FOLDERS);
  const [secrets] = useState<Secret[]>(MOCK_SECRETS);
  const [sharedUsers] = useState<SharedUser[]>(MOCK_SHARED_USERS);
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);

  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [showSecrets, setShowSecrets] = useState(false);

  const [collabSelectedIndex, setCollabSelectedIndex] = useState(0);
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

  const [creatingItem, setCreatingItem] = useState<"env" | "folder" | "collab" | null>(null);
  const [newItemInput, setNewItemInput] = useState("");
  const [newItemCursor, setNewItemCursor] = useState(0);

  const [confirmingDelete, setConfirmingDelete] = useState<{
    type: "env" | "folder" | "secret" | "collab";
    id: string;
    name: string;
  } | null>(null);

  const [editingItem, setEditingItem] = useState<{
    type: "env" | "folder";
    id: string;
    originalName: string;
  } | null>(null);
  const [editItemInput, setEditItemInput] = useState("");
  const [editItemCursor, setEditItemCursor] = useState(0);

  const bulkImportInput = useMultilineInput({ maxLines: 50, maxLineLength: 100 });
  const [bulkImportFormat, setBulkImportFormat] = useState<BulkImportFormat>("env");
  const [bulkImportCollisions, setBulkImportCollisions] = useState<CollisionInfo[]>([]);
  const [bulkImportMode, setBulkImportMode] = useState<"import" | "update">("import");

  const shouldBlinkCursor = activeModal !== "none" || creatingItem !== null || editingItem !== null;
  const cursorVisible = useCursorBlink(shouldBlinkCursor);

  useEffect(() => {
    if (activeModal !== "bulkImport") return;

    const trimmed = bulkImportInput.value.trim();
    if (trimmed === "") {
      setBulkImportCollisions([]);
      return;
    }

    // Parse based on current format
    // biome-ignore lint/suspicious/noExplicitAny: secrets can be any valid JSON structure
    let secrets: any;
    try {
      if (bulkImportFormat === "env") {
        secrets = parseEnvContent(trimmed);
      } else {
        secrets = JSON.parse(trimmed);
      }

      const result = validateBulkImportJson(secrets);
      if (result.valid && result.secrets.length > 0) {
        // Check for collisions in real-time
        const collisions: CollisionInfo[] = [];
        for (const secret of result.secrets) {
          // biome-ignore lint/suspicious/noExplicitAny: Comparison with any type secret
          const existing = secrets.find((s: any) => s.key === secret.key);
          if (existing) {
            collisions.push({ key: secret.key, existingSecretId: existing.id });
          }
        }
        setBulkImportCollisions(collisions);
      } else {
        setBulkImportCollisions([]);
      }
    } catch {
      // Parse error - clear collisions
      setBulkImportCollisions([]);
    }
  }, [bulkImportInput.value, bulkImportFormat, activeModal]);

  const handlePaste = useCallback(
    (text: string) => {
      if (activeModal === "bulkImport") {
        bulkImportInput.handlePaste(text);
      } else if (creatingItem) {
        // Paste into new item input (30 char limit)
        const availableSpace = 30 - newItemInput.length;
        const textToInsert = text.replace(/\s/g, "").slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setNewItemInput(
            newItemInput.slice(0, newItemCursor) + textToInsert + newItemInput.slice(newItemCursor),
          );
          setNewItemCursor(newItemCursor + textToInsert.length);
        }
      } else if (editingItem) {
        // Paste into edit input (30 char limit)
        const availableSpace = 30 - editItemInput.length;
        const textToInsert = text.replace(/\s/g, "").slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setEditItemInput(
            editItemInput.slice(0, editItemCursor) +
              textToInsert +
              editItemInput.slice(editItemCursor),
          );
          setEditItemCursor(editItemCursor + textToInsert.length);
        }
      }
    },
    [
      activeModal,
      bulkImportInput,
      creatingItem,
      newItemInput,
      newItemCursor,
      editingItem,
      editItemInput,
      editItemCursor,
    ],
  );

  usePaste(handlePaste);

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const getCurrentItems = () => {
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
      const folderSecrets = secrets.filter((s) => s.folderId === selectedFolderId);
      return folderSecrets.map((s) => ({
        type: "secret" as const,
        id: s.id,
        name: s.key,
        value: s.value,
        secretType: s.type || "string",
      }));
    }
    return [];
  };

  const items = getCurrentItems();

  const PAGE_SIZE = 10;

  const moveUp = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : items.length - 1;
      // Adjust scroll offset
      if (next < scrollOffset) {
        setScrollOffset(next);
      } else if (next >= scrollOffset + PAGE_SIZE) {
        setScrollOffset(Math.max(0, items.length - PAGE_SIZE));
      } else if (next === items.length - 1) {
        setScrollOffset(Math.max(0, items.length - PAGE_SIZE));
      }
      return next;
    });
  };

  const moveDown = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => {
      const next = prev < items.length - 1 ? prev + 1 : 0;
      // Adjust scroll offset
      if (next >= scrollOffset + PAGE_SIZE) {
        setScrollOffset(next - PAGE_SIZE + 1);
      } else if (next < scrollOffset) {
        setScrollOffset(0);
      }
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
    } else if (item.type === "folder") {
      setSelectedFolderId(item.id);
      setViewLevel("folder");
      setSelectedIndex(0);
    }
  };

  const goBack = () => {
    if (viewLevel === "folder") {
      setSelectedFolderId(null);
      setViewLevel("environment");
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (viewLevel === "environment") {
      setSelectedEnvId(null);
      setViewLevel("environments");
      setSelectedIndex(0);
      setScrollOffset(0);
    } else {
      onBack();
    }
  };

  const closeModal = () => {
    setActiveModal("none");
    setCollabSelectedIndex(0);
    setBulkImportFormat("env");
    setBulkImportCollisions([]);
    bulkImportInput.reset();
  };

  useKeyboard((key) => {
    const isRestricted = projectStatus === "restricted" || projectStatus === "archived";
    if (isRestricted) {
      // Block modification shortcuts
      const blockedKeys = ["n", "u", "d", "c"];
      if (blockedKeys.includes(key.name)) return;
      // Block Option+keys (Update/Import)
      if ((key.meta || key.option) && (key.name === "u" || key.name === "i")) return;
    }

    if (creatingItem) {
      // Helper: Terminal sends Option as meta+ESC sequence
      const isOptionKey = key.meta && key.sequence === "\x1b";

      if (key.name === "escape") {
        setCreatingItem(null);
        setNewItemInput("");
        setNewItemCursor(0);
        return;
      }

      if (key.name === "return") {
        const trimmed = newItemInput.trim();
        if (trimmed) {
          if (creatingItem === "env") {
            runTask(`Creating environment "${trimmed}"...`, async () => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }).then(() => {
              showSuccess(`Environment "${trimmed}" created`);
              setCreatingItem(null);
              setNewItemInput("");
              setNewItemCursor(0);
            });
          } else if (creatingItem === "folder") {
            runTask(`Creating folder "${trimmed}"...`, async () => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }).then(() => {
              showSuccess(`Folder "${trimmed}" created`);
              setCreatingItem(null);
              setNewItemInput("");
              setNewItemCursor(0);
            });
          } else if (creatingItem === "collab") {
            runTask(`Adding collaborator "${trimmed}"...`, async () => {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }).then(() => {
              showSuccess(`Collaborator "${trimmed}" added`);
              setCreatingItem(null);
              setNewItemInput("");
              setNewItemCursor(0);
            });
          }
        }
        return;
      }

      // Arrow left with modifiers
      if (key.name === "left") {
        if (isOptionKey || key.option) {
          // Option+Left: Jump word backward
          let pos = newItemCursor;
          while (pos > 0 && newItemInput[pos - 1] === " ") pos--;
          while (pos > 0 && newItemInput[pos - 1] !== " ") pos--;
          setNewItemCursor(pos);
        } else if (key.meta) {
          // Cmd+Left: Jump to start
          setNewItemCursor(0);
        } else {
          // Regular left
          setNewItemCursor((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Arrow right with modifiers
      if (key.name === "right") {
        if (isOptionKey || key.option) {
          // Option+Right: Jump word forward
          let pos = newItemCursor;
          while (pos < newItemInput.length && newItemInput[pos] !== " ") pos++;
          while (pos < newItemInput.length && newItemInput[pos] === " ") pos++;
          setNewItemCursor(pos);
        } else if (key.meta) {
          // Cmd+Right: Jump to end
          setNewItemCursor(newItemInput.length);
        } else {
          // Regular right
          setNewItemCursor((prev) => Math.min(newItemInput.length, prev + 1));
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
          // (Terminal sends Option as meta, so both behave the same)
          if (newItemCursor > 0) {
            let newPos = newItemCursor;
            while (newPos > 0 && newItemInput[newPos - 1] === " ") newPos--;
            while (newPos > 0 && newItemInput[newPos - 1] !== " ") newPos--;
            setNewItemInput(newItemInput.slice(0, newPos) + newItemInput.slice(newItemCursor));
            setNewItemCursor(newPos);
          }
        } else {
          // Regular backspace: Delete one character
          if (newItemCursor > 0) {
            setNewItemInput(
              newItemInput.slice(0, newItemCursor - 1) + newItemInput.slice(newItemCursor),
            );
            setNewItemCursor(newItemCursor - 1);
          }
        }
        return;
      }

      // Delete key (forward delete)
      if (key.name === "delete") {
        if (newItemCursor < newItemInput.length) {
          setNewItemInput(
            newItemInput.slice(0, newItemCursor) + newItemInput.slice(newItemCursor + 1),
          );
        }
        return;
      }

      // Ctrl+A: Jump to start
      if (key.name === "a" && key.ctrl) {
        setNewItemCursor(0);
        return;
      }

      // Ctrl+E: Jump to end
      if (key.name === "e" && key.ctrl) {
        setNewItemCursor(newItemInput.length);
        return;
      }

      // Ctrl+U: Delete all
      if (key.name === "u" && key.ctrl) {
        setNewItemInput("");
        setNewItemCursor(0);
        return;
      }

      // Ctrl+W: Delete word backward
      if (key.name === "w" && key.ctrl) {
        if (newItemCursor > 0) {
          let newPos = newItemCursor;
          while (newPos > 0 && newItemInput[newPos - 1] === " ") newPos--;
          while (newPos > 0 && newItemInput[newPos - 1] !== " ") newPos--;
          setNewItemInput(newItemInput.slice(0, newPos) + newItemInput.slice(newItemCursor));
          setNewItemCursor(newPos);
        }
        return;
      }

      // Meta+B (Option+Left): Jump word backward
      if (key.name === "b" && key.meta) {
        let pos = newItemCursor;
        while (pos > 0 && newItemInput[pos - 1] === " ") pos--;
        while (pos > 0 && newItemInput[pos - 1] !== " ") pos--;
        setNewItemCursor(pos);
        return;
      }

      // Meta+F (Option+Right): Jump word forward
      if (key.name === "f" && key.meta) {
        let pos = newItemCursor;
        while (pos < newItemInput.length && newItemInput[pos] !== " ") pos++;
        while (pos < newItemInput.length && newItemInput[pos] === " ") pos++;
        setNewItemCursor(pos);
        return;
      }

      // Meta+D (Option+Delete): Delete word forward
      if (key.name === "d" && key.meta) {
        let endPos = newItemCursor;
        while (endPos < newItemInput.length && newItemInput[endPos] === " ") endPos++;
        while (endPos < newItemInput.length && newItemInput[endPos] !== " ") endPos++;
        setNewItemInput(newItemInput.slice(0, newItemCursor) + newItemInput.slice(endPos));
        return;
      }

      // Regular typing (30 char limit) - also handles Cmd+V paste
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const availableSpace = 30 - newItemInput.length;
        const textToInsert = key.sequence.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setNewItemInput(
            newItemInput.slice(0, newItemCursor) + textToInsert + newItemInput.slice(newItemCursor),
          );
          setNewItemCursor(newItemCursor + textToInsert.length);
        }
        return;
      }

      // Ignore all other keys
      return;
    }

    // Inline edit/rename handling
    if (editingItem) {
      // Helper: Terminal sends Option as meta+ESC sequence
      const isOptionKey = key.meta && key.sequence === "\x1b";

      // Escape or up/down arrows cancel editing
      if (key.name === "escape" || key.name === "up" || key.name === "down") {
        setEditingItem(null);
        setEditItemInput("");
        setEditItemCursor(0);
        return;
      }

      // Enter saves the edit
      if (key.name === "return") {
        const trimmed = editItemInput.trim();
        if (trimmed && trimmed !== editingItem.originalName) {
          const itemType = editingItem.type === "env" ? "environment" : "folder";
          runTask(`Renaming ${itemType} to "${trimmed}"...`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }).then(() => {
            showSuccess(`${itemType} renamed to "${trimmed}"`);
            setEditingItem(null);
            setEditItemInput("");
            setEditItemCursor(0);
          });
        } else {
          // No change or empty - just cancel
          setEditingItem(null);
          setEditItemInput("");
          setEditItemCursor(0);
        }
        return;
      }

      // Arrow left with modifiers
      if (key.name === "left") {
        if (isOptionKey || key.option) {
          // Option+Left: Jump word backward
          let pos = editItemCursor;
          while (pos > 0 && editItemInput[pos - 1] === " ") pos--;
          while (pos > 0 && editItemInput[pos - 1] !== " ") pos--;
          setEditItemCursor(pos);
        } else if (key.meta) {
          // Cmd+Left: Jump to start
          setEditItemCursor(0);
        } else {
          // Regular left
          setEditItemCursor((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Arrow right with modifiers
      if (key.name === "right") {
        if (isOptionKey || key.option) {
          // Option+Right: Jump word forward
          let pos = editItemCursor;
          while (pos < editItemInput.length && editItemInput[pos] !== " ") pos++;
          while (pos < editItemInput.length && editItemInput[pos] === " ") pos++;
          setEditItemCursor(pos);
        } else if (key.meta) {
          // Cmd+Right: Jump to end
          setEditItemCursor(editItemInput.length);
        } else {
          // Regular right
          setEditItemCursor((prev) => Math.min(editItemInput.length, prev + 1));
        }
        return;
      }

      // Backspace with modifiers
      if (key.name === "backspace") {
        if (key.meta || key.option) {
          // Meta/Option+Backspace: Delete word backward
          if (editItemCursor > 0) {
            let newPos = editItemCursor;
            while (newPos > 0 && editItemInput[newPos - 1] === " ") newPos--;
            while (newPos > 0 && editItemInput[newPos - 1] !== " ") newPos--;
            setEditItemInput(editItemInput.slice(0, newPos) + editItemInput.slice(editItemCursor));
            setEditItemCursor(newPos);
          }
        } else {
          // Regular backspace: Delete one character
          if (editItemCursor > 0) {
            setEditItemInput(
              editItemInput.slice(0, editItemCursor - 1) + editItemInput.slice(editItemCursor),
            );
            setEditItemCursor(editItemCursor - 1);
          }
        }
        return;
      }

      // Delete key (forward delete)
      if (key.name === "delete") {
        if (editItemCursor < editItemInput.length) {
          setEditItemInput(
            editItemInput.slice(0, editItemCursor) + editItemInput.slice(editItemCursor + 1),
          );
        }
        return;
      }

      // Ctrl+A: Jump to start
      if (key.name === "a" && key.ctrl) {
        setEditItemCursor(0);
        return;
      }

      // Ctrl+E: Jump to end
      if (key.name === "e" && key.ctrl) {
        setEditItemCursor(editItemInput.length);
        return;
      }

      // Ctrl+U: Delete all
      if (key.name === "u" && key.ctrl) {
        setEditItemInput("");
        setEditItemCursor(0);
        return;
      }

      // Ctrl+W: Delete word backward
      if (key.name === "w" && key.ctrl) {
        if (editItemCursor > 0) {
          let newPos = editItemCursor;
          while (newPos > 0 && editItemInput[newPos - 1] === " ") newPos--;
          while (newPos > 0 && editItemInput[newPos - 1] !== " ") newPos--;
          setEditItemInput(editItemInput.slice(0, newPos) + editItemInput.slice(editItemCursor));
          setEditItemCursor(newPos);
        }
        return;
      }

      // Meta+B (Option+Left): Jump word backward
      if (key.name === "b" && key.meta) {
        let pos = editItemCursor;
        while (pos > 0 && editItemInput[pos - 1] === " ") pos--;
        while (pos > 0 && editItemInput[pos - 1] !== " ") pos--;
        setEditItemCursor(pos);
        return;
      }

      // Meta+F (Option+Right): Jump word forward
      if (key.name === "f" && key.meta) {
        let pos = editItemCursor;
        while (pos < editItemInput.length && editItemInput[pos] !== " ") pos++;
        while (pos < editItemInput.length && editItemInput[pos] === " ") pos++;
        setEditItemCursor(pos);
        return;
      }

      // Meta+D (Option+Delete): Delete word forward
      if (key.name === "d" && key.meta) {
        let endPos = editItemCursor;
        while (endPos < editItemInput.length && editItemInput[endPos] === " ") endPos++;
        while (endPos < editItemInput.length && editItemInput[endPos] !== " ") endPos++;
        setEditItemInput(editItemInput.slice(0, editItemCursor) + editItemInput.slice(endPos));
        return;
      }

      // Regular typing (30 char limit) - also handles Cmd+V paste
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const availableSpace = 30 - editItemInput.length;
        const textToInsert = key.sequence.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setEditItemInput(
            editItemInput.slice(0, editItemCursor) +
              textToInsert +
              editItemInput.slice(editItemCursor),
          );
          setEditItemCursor(editItemCursor + textToInsert.length);
        }
        return;
      }

      return;
    }

    if (activeModal === "manageCollaborators") {
      // Handle revoke confirmation first
      if (confirmingDelete && confirmingDelete.type === "collab") {
        if (key.name === "y") {
          // Revoke without rotation (just yes)
          runTask(`Revoking ${confirmingDelete.name}...`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }).then(() => {
            showSuccess(`${confirmingDelete.name} revoked`);
            setConfirmingDelete(null);
          });
        } else if (key.name === "r") {
          // Revoke with rotation (yes + rotate)
          runTask(`Revoking ${confirmingDelete.name} and rotating keys...`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }).then(() => {
            showSuccess(`${confirmingDelete.name} revoked and keys rotated`);
            setConfirmingDelete(null);
          });
        } else if (key.name === "n" || key.name === "escape") {
          setConfirmingDelete(null);
        }
        return;
      }

      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "a") {
        setCreatingItem("collab");
        setNewItemInput("");
        setNewItemCursor(0);
      } else if (key.name === "d") {
        const user = sharedUsers[collabSelectedIndex];
        if (user) {
          setConfirmingDelete({ type: "collab", id: user.id, name: user.email });
        }
      } else if (key.name === "up" || key.name === "k") {
        setCollabSelectedIndex((prev) => (prev > 0 ? prev - 1 : sharedUsers.length - 1));
        setConfirmingDelete(null); // Clear confirmation on navigation
      } else if (key.name === "down" || key.name === "j") {
        setCollabSelectedIndex((prev) => (prev < sharedUsers.length - 1 ? prev + 1 : 0));
        setConfirmingDelete(null); // Clear confirmation on navigation
      }
      return;
    }

    if (activeModal === "commandPalette") {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "up" || key.name === "k") {
        setCommandPaletteIndex((prev) => {
          const commands = getAllCommands();
          let next = prev > 0 ? prev - 1 : commands.length - 1;
          // Skip disabled items
          let attempts = commands.length;
          while (commands[next].disabled && attempts > 0) {
            next = next > 0 ? next - 1 : commands.length - 1;
            attempts--;
          }
          return next;
        });
      } else if (key.name === "down" || key.name === "j") {
        setCommandPaletteIndex((prev) => {
          const commands = getAllCommands();
          let next = prev < commands.length - 1 ? prev + 1 : 0;
          // Skip disabled items
          let attempts = commands.length;
          while (commands[next].disabled && attempts > 0) {
            next = next < commands.length - 1 ? next + 1 : 0;
            attempts--;
          }
          return next;
        });
      } else if (key.name === "return") {
        // Execute selected command
        const commands = getAllCommands();
        const cmd = commands[commandPaletteIndex];
        if (cmd) {
          closeModal();
          executeCommand(cmd.key);
        }
      }
      return;
    }

    if (activeModal === "bulkImport") {
      if (key.name === "escape") {
        closeModal();
        return;
      }

      // Cmd+J: Toggle format - only convert from .env to JSON (one-way to avoid data loss)
      if (key.name === "j" && key.meta) {
        const currentContent = bulkImportInput.value.trim();

        if (bulkImportFormat === "env") {
          // Convert .env to JSON (removes comments and normalizes format)
          if (currentContent === "") {
            // Empty content - just switch format with empty array
            bulkImportInput.setValue(
              '[\n  {\n    "key": "",\n    "value": "",\n    "type": "string",\n    "scope": "shared"\n  }\n]',
            );
            setBulkImportFormat("json");
          } else {
            const jsonContent = envToJson(currentContent);
            if (jsonContent && jsonContent.trim() !== "" && jsonContent !== "[]") {
              bulkImportInput.setValue(jsonContent);
              setBulkImportFormat("json");
            }
          }
        } else {
          // JSON to .env - convert back
          const envContent = jsonToEnv(currentContent);

          if (envContent && envContent.trim() !== "") {
            bulkImportInput.setValue(envContent);
            setBulkImportFormat("env");
          } else {
            showSuccess("Could not convert - check JSON syntax");
          }
        }
        return;
      }

      // Cmd+I: Import (skip collisions)
      if (key.name === "i" && key.meta) {
        const trimmed = bulkImportInput.value.trim();
        if (!trimmed) return;

        // biome-ignore lint/suspicious/noExplicitAny: secrets can be any valid JSON structure
        let secrets: any;
        if (bulkImportFormat === "env") {
          secrets = parseEnvContent(trimmed);
        } else {
          try {
            secrets = JSON.parse(trimmed);
          } catch {
            // Invalid JSON - don't import
            return;
          }
        }

        const result = validateBulkImportJson(secrets);
        // Don't import if validation failed or no secrets
        if (!result.valid || result.errors.length > 0 || result.secrets.length === 0) {
          return;
        }

        // Check for collisions with existing secrets
        const collisions: CollisionInfo[] = [];
        for (const secret of result.secrets) {
          const existing = secrets.find((s: Secret) => s.key === secret.key);
          if (existing) {
            collisions.push({ key: secret.key, existingSecretId: existing.id });
          }
        }

        // Update collision state for display
        setBulkImportCollisions(collisions);

        runTask("Importing secrets (skipping collisions)...", async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }).then(() => {
          const skipped = collisions.length;
          const imported = result.secrets.length - skipped;
          showSuccess(`${imported} secrets imported${skipped > 0 ? ` (${skipped} skipped)` : ""}`);
          closeModal();
        });
        return;
      }

      // Cmd+O: Import and overwrite collisions
      if (key.name === "o" && key.meta) {
        const trimmed = bulkImportInput.value.trim();
        if (!trimmed) return;

        // biome-ignore lint/suspicious/noExplicitAny: secrets can be any valid JSON structure
        let secrets: any;
        if (bulkImportFormat === "env") {
          secrets = parseEnvContent(trimmed);
        } else {
          try {
            secrets = JSON.parse(trimmed);
          } catch {
            // Invalid JSON - don't import
            return;
          }
        }

        const result = validateBulkImportJson(secrets);
        // Don't import if validation failed or no secrets
        if (!result.valid || result.errors.length > 0 || result.secrets.length === 0) {
          return;
        }

        runTask("Importing secrets (overwriting collisions)...", async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }).then(() => {
          showSuccess(`${result.secrets.length} secrets imported (collisions overwritten)`);
          closeModal();
        });
        return;
      }

      // Delegate to multiline input for editing
      // biome-ignore lint/suspicious/noExplicitAny: handleKey expects specific key type
      bulkImportInput.handleKey(key as any);
      return;
    }

    if (activeModal !== "none") {
      if (key.name === "escape") {
        closeModal();
      }
      return;
    }

    // Handle delete confirmation first (y/n)
    if (
      confirmingDelete &&
      (confirmingDelete.type === "env" ||
        confirmingDelete.type === "folder" ||
        confirmingDelete.type === "secret")
    ) {
      if (key.name === "y") {
        const itemType = confirmingDelete.type === "env" ? "environment" : confirmingDelete.type;
        runTask(`Deleting ${itemType} "${confirmingDelete.name}"...`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }).then(() => {
          showSuccess(`${confirmingDelete.name} deleted`);
          setConfirmingDelete(null);
        });
      } else if (key.name === "n" || key.name === "escape") {
        setConfirmingDelete(null);
      }
      return;
    }

    if (key.name === "escape" || key.name === "backspace") {
      setConfirmingDelete(null); // Clear confirmation on navigation
      goBack();
    } else if (key.name === "k" || key.name === "up") {
      moveUp();
      setConfirmingDelete(null); // Clear confirmation on navigation
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
      setConfirmingDelete(null); // Clear confirmation on navigation
    } else if (key.name === "return" || key.name === "l" || key.name === "right") {
      enter();
    } else if (key.name === "d") {
      // Delete current item with confirmation
      const items = getCurrentItems();
      const item = items[selectedIndex];
      if (item) {
        let itemType: "env" | "folder" | "secret" | "collab" = "secret";
        if (viewLevel === "environments") itemType = "env";
        else if (item.type === "folder") itemType = "folder";
        else if (item.type === "secret") itemType = "secret";
        setConfirmingDelete({ type: itemType, id: item.id, name: item.name });
      }
    } else if (key.name === "n" && viewLevel === "environments") {
      setCreatingItem("env");
      setNewItemInput("");
      setNewItemCursor(0);
    } else if (key.name === "n" && viewLevel === "environment") {
      setCreatingItem("folder");
      setNewItemInput("");
      setNewItemCursor(0);
    } else if (
      key.name === "i" &&
      key.meta &&
      (viewLevel === "environment" || viewLevel === "folder")
    ) {
      // Option+I: Import secrets
      const placeholderTemplate = `# Paste your .env file or JSON array here
# Example .env format:
API_KEY=your_api_key_here
DATABASE_URL=postgresql://localhost:5432/db
REDIS_URL=redis://localhost:6379

# Press ⌥j to switch to JSON format for type/scope control`;

      bulkImportInput.setValue(placeholderTemplate);
      setBulkImportFormat("env");
      setBulkImportMode("import");
      setActiveModal("bulkImport");
    } else if (
      key.name === "u" &&
      key.meta &&
      (viewLevel === "environment" || viewLevel === "folder")
    ) {
      // Option+U: Update/edit secrets
      const itemsToLoad = getCurrentItems().filter((item) => item.type === "secret");
      if (itemsToLoad.length === 0) {
        showSuccess("No secrets to edit");
        return;
      }
      const secretsJson = JSON.stringify(
        itemsToLoad.map((item) => ({
          key: item.name,
          value: (item as { value?: string }).value || "",
          type: "string",
          scope: "shared",
        })),
        null,
        2,
      );
      bulkImportInput.setValue(secretsJson);
      setBulkImportFormat("json");
      setBulkImportMode("update");
      setActiveModal("bulkImport");
    } else if (key.name === "c") {
      setActiveModal("manageCollaborators");
    } else if (key.name === "u" && !key.meta) {
      // 'u' for rename at environments level, or rename folder at environment level
      if (viewLevel === "environments") {
        // Rename environment
        const env = environments[selectedIndex];
        if (env) {
          setEditingItem({ type: "env", id: env.id, originalName: env.name });
          setEditItemInput(env.name);
          setEditItemCursor(env.name.length);
        }
      } else if (viewLevel === "environment") {
        // Check if selected item is folder - only rename folders with 'u'
        const items = getCurrentItems();
        const selectedItem = items[selectedIndex];
        if (selectedItem && selectedItem.type === "folder") {
          // Rename folder
          setEditingItem({ type: "folder", id: selectedItem.id, originalName: selectedItem.name });
          setEditItemInput(selectedItem.name);
          setEditItemCursor(selectedItem.name.length);
        }
        // If secret is selected, do nothing - use Ctrl+U for bulk edit
      }
      // folder level: 'u' does nothing, use Ctrl+U for bulk edit
    } else if (key.name === "v") {
      setShowSecrets((prev) => !prev);
    } else if (key.sequence === "?") {
      setCommandPaletteIndex(0);
      setActiveModal("commandPalette");
    }
  });

  const getAllCommands = () => {
    const commands = [];

    const isRestricted = projectStatus === "restricted" || projectStatus === "archived";

    // Create commands - context aware
    if (viewLevel === "environments") {
      commands.push({
        key: "n",
        description: "Create environment",
        category: "Create",
        disabled: isRestricted,
      });
      commands.push({
        key: "u",
        description: "Rename environment",
        category: "Manage",
        disabled: isRestricted,
      });
      commands.push({ key: "esc", description: "Back to home", category: "Navigate" });
    }
    if (viewLevel === "environment") {
      commands.push({
        key: "n",
        description: "Create folder",
        category: "Create",
        disabled: isRestricted,
      });

      // Get current selected item to determine which commands to show
      const currentItems = getCurrentItems();
      const selectedItem = currentItems[selectedIndex];
      const isFolderSelected = selectedItem?.type === "folder";

      if (isFolderSelected) {
        commands.push({
          key: "u",
          description: "Rename folder",
          category: "Manage",
          disabled: isRestricted,
        });
      }

      commands.push({
        key: "⌥u",
        description: "Update secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      commands.push({
        key: "⌥i",
        description: "Import secrets",
        category: "Create",
        disabled: isRestricted,
      });
      commands.push({ key: "esc", description: "Go back", category: "Navigate" });
    }
    if (viewLevel === "folder") {
      commands.push({
        key: "⌥u",
        description: "Update secrets",
        category: "Manage",
        disabled: isRestricted,
      });
      commands.push({
        key: "⌥i",
        description: "Import secrets",
        category: "Create",
        disabled: isRestricted,
      });
      commands.push({ key: "esc", description: "Go back", category: "Navigate" });
    }

    // Manage commands - always available
    commands.push({
      key: "c",
      description: "Manage collaborators",
      category: "Manage",
      disabled: isRestricted,
    });
    commands.push({ key: "w", description: "View log history", category: "Manage" });

    // View commands - context aware
    if (viewLevel === "folder" || viewLevel === "environment") {
      commands.push({
        key: "v",
        description: showSecrets ? "Hide secrets" : "Show secrets",
        category: "View",
      });
    }

    // Sort commands to match CommandPaletteModal visual order
    const categoryOrder = ["Navigate", "Create", "Manage", "View", "Account"];
    return commands.sort((a, b) => {
      const idxA = categoryOrder.indexOf(a.category);
      const idxB = categoryOrder.indexOf(b.category);
      // If categories match (or neither found), maintain original order (stable sort)
      if (idxA === idxB) return 0;
      // If one found and other not, put found first (though all should be found)
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  };

  const executeCommand = (key: string) => {
    const isRestricted = projectStatus === "restricted" || projectStatus === "archived";
    const restrictedKeys = ["n", "u", "c", "⌥i", "⌥u"];
    if (isRestricted && restrictedKeys.includes(key)) {
      return;
    }

    if (key === "n" && viewLevel === "environments") {
      setCreatingItem("env");
      setNewItemInput("");
      setNewItemCursor(0);
    } else if (key === "n" && viewLevel === "environment") {
      setCreatingItem("folder");
      setNewItemInput("");
      setNewItemCursor(0);
    } else if (key === "u" && viewLevel === "environments") {
      // Rename environment
      const env = environments[selectedIndex];
      if (env) {
        setEditingItem({ type: "env", id: env.id, originalName: env.name });
        setEditItemInput(env.name);
        setEditItemCursor(env.name.length);
      }
    } else if (key === "u" && viewLevel === "environment") {
      // Rename folder (only works if a folder is selected)
      const currentItems = getCurrentItems();
      const selectedItem = currentItems[selectedIndex];
      if (selectedItem && selectedItem.type === "folder") {
        setEditingItem({ type: "folder", id: selectedItem.id, originalName: selectedItem.name });
        setEditItemInput(selectedItem.name);
        setEditItemCursor(selectedItem.name.length);
      }
    } else if (key === "esc") {
      // Back to home/previous level
      goBack();
    } else if (key === "⌥i") {
      // Import secrets
      const placeholderTemplate = `# Paste your .env file or JSON array here
# Example .env format:
API_KEY=your_api_key_here
DATABASE_URL=postgresql://localhost:5432/db
REDIS_URL=redis://localhost:6379

# Press ⌥j to switch to JSON format for type/scope control`;

      bulkImportInput.setValue(placeholderTemplate);
      setBulkImportFormat("env");
      setBulkImportMode("import");
      setActiveModal("bulkImport");
    } else if (key === "⌥u") {
      // Update secrets
      const itemsToLoad = getCurrentItems().filter((item) => item.type === "secret");
      if (itemsToLoad.length === 0) {
        showSuccess("No secrets to edit");
        return;
      }
      const secretsJson = JSON.stringify(
        itemsToLoad.map((item) => ({
          key: item.name,
          value: (item as { value?: string }).value || "",
          type: "string",
          scope: "shared",
        })),
        null,
        2,
      );
      bulkImportInput.setValue(secretsJson);
      setBulkImportFormat("json");
      setBulkImportMode("update");
      setActiveModal("bulkImport");
    } else if (key === "c") {
      setActiveModal("manageCollaborators");
    } else if (key === "v") {
      setShowSecrets((prev) => !prev);
    }
  };

  const getShortcutGroups = () => {
    const isRestricted = projectStatus === "restricted" || projectStatus === "archived";

    // When creating an environment or folder, show only create/cancel shortcuts
    if (creatingItem === "env" || creatingItem === "folder") {
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

    // When editing/renaming an environment or folder, show only save/cancel shortcuts
    if (editingItem) {
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

    // Ultra-minimal: only show relevant create action(s) for current context + esc back
    if (viewLevel === "environments") {
      return {
        primary: [
          {
            shortcuts: [
              { key: "n", description: "create environment", disabled: isRestricted },
              { key: "u", description: "rename environment", disabled: isRestricted },
            ],
          },
        ],
        secondary: [],
      };
    }

    if (viewLevel === "environment") {
      // Get current selected item to determine if rename should be shown
      const currentItems = getCurrentItems();
      const selectedItem = currentItems[selectedIndex];
      const isSecretSelected = selectedItem?.type === "secret";

      const shortcuts = [
        { key: "n", description: "create folder", disabled: isRestricted },
        // Only show rename if a folder is selected (not a secret)
        ...(isSecretSelected
          ? []
          : [{ key: "u", description: "rename folder", disabled: isRestricted }]),
        // Show update secrets only when secret is selected
        ...(isSecretSelected
          ? [{ key: "⌥u", description: "update secrets", disabled: isRestricted }]
          : []),
        { key: "⌥i", description: "import secrets", disabled: isRestricted },
        { key: "esc", description: "back" },
      ];

      return {
        primary: [
          {
            shortcuts,
          },
        ],
        secondary: [],
      };
    }

    // folder level
    return {
      primary: [
        {
          shortcuts: [
            { key: "⌥u", description: "update secrets", disabled: isRestricted },
            { key: "⌥i", description: "import secrets", disabled: isRestricted },
          ],
        },
      ],
      secondary: [],
    };
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
        <box flexDirection="column">
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
                {selectedEnv && <span fg={THEME_COLORS.textDim}> / </span>}
                {selectedEnv && <span fg={THEME_COLORS.secondary}>{selectedEnv.name}</span>}
                {selectedFolder && <span fg={THEME_COLORS.textDim}> / </span>}
                {selectedFolder && <span fg={THEME_COLORS.accent}>{selectedFolder.name}</span>}
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
                    )
              }
            >
              {items.length === 0 && !creatingItem ? (
                <box height={1}>
                  <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
                </box>
              ) : (
                <>
                  {items.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((item, index) => {
                    const indicator = getTypeIndicator(item.type);
                    const actualIndex = index + scrollOffset;
                    const isSelected =
                      actualIndex === selectedIndex && !creatingItem && !editingItem;
                    const canEnter = item.type !== "secret";
                    const isEditing = editingItem?.id === item.id;

                    return (
                      <box key={item.id} flexDirection="column">
                        {isEditing ? (
                          <InlineInput
                            value={editItemInput}
                            cursor={editItemCursor}
                            cursorVisible={cursorVisible}
                            maxWidth={50}
                            maxLength={30}
                            width={66}
                            isFocused={true}
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
                                  // Calculate max value length: 66 - "  [*] " - name - ": " - type - " = "
                                  const prefixLen =
                                    6 + item.name.length + 2 + secretType.length + 3;
                                  const maxValueLen = 66 - prefixLen;
                                  const displayValue =
                                    value.length > maxValueLen
                                      ? `${value.slice(0, maxValueLen - 3)}...`
                                      : value;
                                  return (
                                    <>
                                      <span fg={THEME_COLORS.textDim}>: </span>
                                      <span fg={THEME_COLORS.secondary}>{secretType}</span>
                                      <span fg={THEME_COLORS.textDim}> = </span>
                                      <span fg={THEME_COLORS.accent}>{displayValue}</span>
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
                  {creatingItem &&
                    (() => {
                      const placeholder =
                        creatingItem === "env"
                          ? "e.g. production, staging"
                          : creatingItem === "folder"
                            ? "e.g. database, auth"
                            : "e.g. user@example.com";

                      return (
                        <InlineInput
                          value={newItemInput}
                          cursor={newItemCursor}
                          cursorVisible={cursorVisible}
                          maxWidth={50}
                          maxLength={30}
                          placeholder={placeholder}
                          width={66}
                        />
                      );
                    })()}
                </>
              )}
            </box>

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
                  {viewLevel === "environment" && (
                    <>
                      {folders.filter((f) => f.environmentId === selectedEnvId).length > 0 && (
                        <>
                          {folders.filter((f) => f.environmentId === selectedEnvId).length} folders
                          ·{" "}
                        </>
                      )}
                      {
                        secrets.filter((s) => s.environmentId === selectedEnvId && !s.folderId)
                          .length
                      }{" "}
                      secrets
                    </>
                  )}
                  {viewLevel === "folder" && (
                    <>{secrets.filter((s) => s.folderId === selectedFolderId).length} secrets</>
                  )}
                </text>
              </box>
            </box>

            {(activeModal === "none" || activeModal === "commandPalette") && (
              <box marginTop={1}>
                <GuideBar
                  groups={getShortcutGroups()}
                  inline={true}
                  customWidth={66}
                  minimal={true}
                  showHelp={true}
                />
              </box>
            )}
          </box>
        </box>
      </box>

      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        projectName={projectName}
        collaborators={sharedUsers}
        selectedIndex={collabSelectedIndex}
        creatingCollab={creatingItem === "collab"}
        newCollabInput={newItemInput}
        newCollabCursor={newItemCursor}
        cursorVisible={cursorVisible}
        confirmingDelete={confirmingDelete}
        onClose={closeModal}
      />

      <CommandPaletteModal
        visible={activeModal === "commandPalette"}
        commands={getAllCommands()}
        selectedIndex={commandPaletteIndex}
        onClose={closeModal}
      />

      <BulkImportModal
        visible={activeModal === "bulkImport"}
        content={bulkImportInput.value}
        cursor={bulkImportInput.cursor}
        format={bulkImportFormat}
        collisions={bulkImportCollisions}
        cursorVisible={cursorVisible}
        mode={bulkImportMode}
        onClose={closeModal}
      />
    </box>
  );
}
