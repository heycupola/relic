import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { STATUS_COLORS, THEME_COLORS } from "../lib/constants";
import type {
  Environment,
  Folder,
  LogEntry,
  ModalType,
  ProjectStatus,
  Secret,
  SharedUser,
  ViewLevel,
} from "../lib/types";
import { usePaste } from "../lib/usePaste";
import { useTaskQueue } from "../lib/useTaskQueue";
import { useTextInput } from "../lib/useTextInput";
import { GuideBar } from "./GuideBar";
import {
  CommandPaletteModal,
  CreateEnvironmentModal,
  CreateFolderModal,
  CreateSecretModal,
  ManageCollaboratorsModal,
} from "./modals";

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
    environmentId: "env1",
  },
  { id: "s2", key: "API_KEY", value: "sk_test_4eC39HqLyjWDarjtT1zdp7dc", environmentId: "env1" },
  {
    id: "s3",
    key: "JWT_SECRET",
    value: "a-very-secret-signing-key",
    environmentId: "env1",
    folderId: "f1",
  },
  { id: "s4", key: "SMTP_PASSWORD", value: "pass123", environmentId: "env1", folderId: "f1" },
  { id: "s5", key: "AWS_ACCESS_KEY", value: "AKIAIOSFODNN7EXAMPLE", environmentId: "env1" },
  { id: "s6", key: "REDIS_URL", value: "redis://localhost:6379", environmentId: "env1" },
  { id: "s7", key: "STRIPE_KEY", value: "sk_test_51Mz...", environmentId: "env2" },
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
  const [cursorVisible, setCursorVisible] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [showSecrets, setShowSecrets] = useState(false);

  const [secretInputFocus, setSecretInputFocus] = useState<"key" | "value" | "type">("key");
  const [secretValueType, setSecretValueType] = useState<"string" | "number" | "boolean">("string");
  const [collabSelectedIndex, setCollabSelectedIndex] = useState(0);
  const [collabMode, setCollabMode] = useState<"list" | "add" | "confirmRevoke">("list");
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0);

  const envInput = useTextInput({
    maxLength: 30,
    onSubmit: (value) => {
      if (value.trim()) {
        closeModal();
        runTask(`Creating environment "${value}"...`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }).then(() => {
          showSuccess(`Environment "${value}" created`);
        });
      }
    },
  });

  const folderInput = useTextInput({
    maxLength: 30,
    onSubmit: (value) => {
      if (value.trim()) {
        console.log("Creating folder:", value);
        closeModal();
      }
    },
  });

  const secretKeyInput = useTextInput({ maxLength: 100 });
  const secretValueInput = useTextInput({ maxLength: 1000 });

  const collabEmailInput = useTextInput({
    maxLength: 100,
    onSubmit: (value) => {
      if (value.trim()) {
        console.log("Adding collaborator:", value);
        closeModal();
      }
    },
  });

  useEffect(() => {
    if (activeModal === "none") return;
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [activeModal]);

  const handlePaste = useCallback(
    (text: string) => {
      setCursorVisible(true);
      if (activeModal === "createEnv") {
        envInput.handlePaste(text);
      } else if (activeModal === "createFolder") {
        folderInput.handlePaste(text);
      } else if (activeModal === "createSecret") {
        if (secretInputFocus === "key") {
          secretKeyInput.handlePaste(text);
        } else {
          secretValueInput.handlePaste(text);
        }
      } else if (activeModal === "manageCollaborators" && collabMode === "add") {
        collabEmailInput.handlePaste(text);
      }
    },
    [
      activeModal,
      secretInputFocus,
      collabMode,
      envInput,
      folderInput,
      secretKeyInput,
      secretValueInput,
      collabEmailInput,
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
    envInput.reset();
    folderInput.reset();
    secretKeyInput.reset();
    secretValueInput.reset();
    collabEmailInput.reset();
    setSecretInputFocus("key");
    setSecretValueType("string");
    setCollabMode("list");
    setCollabSelectedIndex(0);
  };

  const handleCreateSecret = () => {
    if (secretKeyInput.value.trim() && secretValueInput.value.trim()) {
      console.log("Creating secret:", secretKeyInput.value, secretValueInput.value);
      closeModal();
    }
  };

  useKeyboard((key) => {
    setCursorVisible(true);

    if (activeModal === "createEnv") {
      if (key.name === "escape") {
        closeModal();
      } else if (!envInput.handleKey(key)) {
        return;
      }
      return;
    }

    if (activeModal === "createFolder") {
      if (key.name === "escape") {
        closeModal();
      } else if (!folderInput.handleKey(key)) {
        return;
      }
      return;
    }

    if (activeModal === "createSecret") {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "tab") {
        // Cycle: key -> value -> type -> key
        setSecretInputFocus((prev) => {
          if (prev === "key") return "value";
          if (prev === "value") return "type";
          return "key";
        });
      } else if (key.name === "return") {
        handleCreateSecret();
      } else if (secretInputFocus === "type") {
        // Handle left/right for type cycling
        if (key.name === "left" || key.name === "h") {
          setSecretValueType((prev) => {
            if (prev === "string") return "boolean";
            if (prev === "number") return "string";
            return "number";
          });
        } else if (key.name === "right" || key.name === "l") {
          setSecretValueType((prev) => {
            if (prev === "string") return "number";
            if (prev === "number") return "boolean";
            return "string";
          });
        }
      } else {
        const currentInput = secretInputFocus === "key" ? secretKeyInput : secretValueInput;
        currentInput.handleKey(key);
      }
      return;
    }

    if (activeModal === "manageCollaborators") {
      if (collabMode === "add") {
        if (key.name === "escape") {
          setCollabMode("list");
          collabEmailInput.reset();
        } else if (!collabEmailInput.handleKey(key)) {
          return;
        }
      } else if (collabMode === "confirmRevoke") {
        if (key.name === "y") {
          const selectedCollab = sharedUsers[collabSelectedIndex];
          if (selectedCollab) {
            console.log("Revoking collaborator:", selectedCollab.email);
            // TODO: Actually revoke collaborator
          }
          setCollabMode("list");
        } else if (key.name === "n" || key.name === "escape") {
          setCollabMode("list");
        }
      } else {
        if (key.name === "escape") {
          closeModal();
        } else if (key.name === "a") {
          setCollabMode("add");
        } else if (key.name === "d") {
          if (sharedUsers[collabSelectedIndex]) {
            setCollabMode("confirmRevoke");
          }
        } else if (key.name === "up" || key.name === "k") {
          setCollabSelectedIndex((prev) => (prev > 0 ? prev - 1 : sharedUsers.length - 1));
        } else if (key.name === "down" || key.name === "j") {
          setCollabSelectedIndex((prev) => (prev < sharedUsers.length - 1 ? prev + 1 : 0));
        }
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

    if (activeModal !== "none") {
      if (key.name === "escape") {
        closeModal();
      }
      return;
    }

    if (key.name === "escape" || key.name === "backspace") {
      goBack();
    } else if (key.name === "k" || key.name === "up") {
      moveUp();
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
    } else if (key.name === "return" || key.name === "l" || key.name === "right") {
      enter();
    } else if (key.name === "n" && viewLevel === "environments") {
      setActiveModal("createEnv");
    } else if (key.name === "f" && viewLevel === "environment") {
      setActiveModal("createFolder");
    } else if (key.name === "s" && (viewLevel === "environment" || viewLevel === "folder")) {
      setActiveModal("createSecret");
    } else if (key.name === "c") {
      setActiveModal("manageCollaborators");
    } else if (key.name === "w") {
      console.log("Opening web dashboard for project:", _projectId);
    } else if (key.name === "v") {
      setShowSecrets((prev) => !prev);
    } else if (key.sequence === "?") {
      setCommandPaletteIndex(0);
      setActiveModal("commandPalette");
    }
  });

  const getAllCommands = () => {
    const commands = [];

    // Create commands - context aware
    if (viewLevel === "environments") {
      commands.push({ key: "n", description: "New environment", category: "Create" });
    }
    if (viewLevel === "environment") {
      commands.push({ key: "f", description: "New folder", category: "Create" });
      commands.push({ key: "s", description: "New secret", category: "Create" });
    }
    if (viewLevel === "folder") {
      commands.push({ key: "s", description: "New secret", category: "Create" });
    }

    // Manage commands - always available
    commands.push({ key: "c", description: "Manage collaborators", category: "Manage" });
    commands.push({ key: "w", description: "View log history", category: "Manage" });

    // View commands - context aware
    if (viewLevel === "folder" || viewLevel === "environment") {
      commands.push({
        key: "v",
        description: showSecrets ? "Hide secrets" : "Show secrets",
        category: "View",
      });
    }

    return commands;
  };

  const executeCommand = (key: string) => {
    if (key === "n" && viewLevel === "environments") setActiveModal("createEnv");
    else if (key === "f" && viewLevel === "environment") setActiveModal("createFolder");
    else if (key === "s") setActiveModal("createSecret");
    else if (key === "c") setActiveModal("manageCollaborators");
    else if (key === "v") setShowSecrets((prev) => !prev);
    else if (key === "esc") goBack();
  };

  const getShortcutGroups = () => {
    // Ultra-minimal: only show relevant create action(s) for current context + esc back
    if (viewLevel === "environments") {
      return {
        primary: [
          {
            shortcuts: [
              { key: "n", description: "new environment" },
              { key: "esc", description: "back" },
            ],
          },
        ],
        secondary: [],
      };
    }

    if (viewLevel === "environment") {
      return {
        primary: [
          {
            shortcuts: [
              { key: "f", description: "new folder" },
              { key: "s", description: "new secret" },
              { key: "esc", description: "back" },
            ],
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
            { key: "s", description: "new secret" },
            { key: "esc", description: "back" },
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
            {/* Header Area with integrated path */}
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
                  {projectStatus === "owned" ? "●" : projectStatus === "shared" ? "◐" : "○"}{" "}
                  {projectStatus}
                </span>
              </text>
            </box>

            {/* Main List Area */}
            <box
              flexDirection="column"
              width={66}
              height={items.length === 0 ? 1 : Math.min(items.length, PAGE_SIZE)}
            >
              {items.length === 0 ? (
                <box height={1}>
                  <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
                </box>
              ) : (
                items.slice(scrollOffset, scrollOffset + PAGE_SIZE).map((item, index) => {
                  const indicator = getTypeIndicator(item.type);
                  const actualIndex = index + scrollOffset;
                  const isSelected = actualIndex === selectedIndex;
                  const canEnter = item.type !== "secret";

                  return (
                    <box key={item.id} height={1} width={66}>
                      <text>
                        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                          {isSelected && canEnter ? "› " : "  "}
                        </span>
                        <span fg={indicator.color}>{indicator.prefix}</span>
                        <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                          {" "}
                          {item.name}
                          {item.type === "secret" && (
                            <span fg={THEME_COLORS.textDim}>
                              : {showSecrets ? (item as { value: string }).value : "********"}
                            </span>
                          )}
                        </span>
                      </text>
                    </box>
                  );
                })
              )}
            </box>

            {/* Stats/Footer Area */}
            <box flexDirection="column" marginTop={1}>
              {viewLevel === "environments" && logs.length > 0 && (
                <box height={1} width={66} marginBottom={1}>
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

      <CreateEnvironmentModal
        visible={activeModal === "createEnv"}
        value={envInput.value}
        cursor={envInput.cursor}
        cursorVisible={cursorVisible}
        onClose={closeModal}
      />

      <CreateFolderModal
        visible={activeModal === "createFolder"}
        value={folderInput.value}
        cursor={folderInput.cursor}
        cursorVisible={cursorVisible}
        onClose={closeModal}
      />

      <CreateSecretModal
        visible={activeModal === "createSecret"}
        keyValue={secretKeyInput.value}
        keyCursor={secretKeyInput.cursor}
        secretValue={secretValueInput.value}
        secretCursor={secretValueInput.cursor}
        cursorVisible={cursorVisible}
        focusedField={secretInputFocus}
        valueType={secretValueType}
        onClose={closeModal}
      />

      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        collaborators={sharedUsers}
        selectedIndex={collabSelectedIndex}
        mode={collabMode}
        addEmail={collabEmailInput.value}
        addEmailCursor={collabEmailInput.cursor}
        cursorVisible={cursorVisible}
        onClose={closeModal}
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
