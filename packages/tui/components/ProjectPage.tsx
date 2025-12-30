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
  { id: "s1", key: "DB_HOST", folderId: "f1", environmentId: "env1" },
  { id: "s2", key: "DB_PORT", folderId: "f1", environmentId: "env1" },
  { id: "s3", key: "DB_USER", folderId: "f1", environmentId: "env1" },
  { id: "s4", key: "JWT_SECRET", folderId: "f2", environmentId: "env1" },
  { id: "s5", key: "API_KEY", environmentId: "env1" },
  { id: "s6", key: "REDIS_URL", environmentId: "env1" },
  { id: "s7", key: "STRIPE_KEY", environmentId: "env2" },
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
  const [cursorVisible, setCursorVisible] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalType>("none");

  const [secretInputFocus, setSecretInputFocus] = useState<"key" | "value">("key");
  const [collabSelectedIndex, setCollabSelectedIndex] = useState(0);
  const [collabAddMode, setCollabAddMode] = useState(false);

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
      } else if (activeModal === "manageCollaborators" && collabAddMode) {
        collabEmailInput.handlePaste(text);
      }
    },
    [
      activeModal,
      secretInputFocus,
      collabAddMode,
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
        ...rootSecrets.map((s) => ({ type: "secret" as const, id: s.id, name: s.key })),
      ];
    }
    if (viewLevel === "folder" && selectedFolderId) {
      const folderSecrets = secrets.filter((s) => s.folderId === selectedFolderId);
      return folderSecrets.map((s) => ({ type: "secret" as const, id: s.id, name: s.key }));
    }
    return [];
  };

  const items = getCurrentItems();

  const moveUp = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const moveDown = () => {
    if (items.length === 0) return;
    setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
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
    } else if (viewLevel === "environment") {
      setSelectedEnvId(null);
      setViewLevel("environments");
      setSelectedIndex(0);
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
    setCollabAddMode(false);
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
        setSecretInputFocus((prev) => (prev === "key" ? "value" : "key"));
      } else if (key.name === "return") {
        handleCreateSecret();
      } else {
        const currentInput = secretInputFocus === "key" ? secretKeyInput : secretValueInput;
        currentInput.handleKey(key);
      }
      return;
    }

    if (activeModal === "manageCollaborators") {
      if (collabAddMode) {
        if (key.name === "escape") {
          setCollabAddMode(false);
          collabEmailInput.reset();
        } else if (!collabEmailInput.handleKey(key)) {
          return;
        }
      } else {
        if (key.name === "escape") {
          closeModal();
        } else if (key.name === "a") {
          setCollabAddMode(true);
        } else if (key.name === "d") {
          const selectedCollab = sharedUsers[collabSelectedIndex];
          if (selectedCollab) {
            console.log("Revoking collaborator:", selectedCollab.email);
          }
        } else if (key.name === "up" || key.name === "k") {
          setCollabSelectedIndex((prev) => (prev > 0 ? prev - 1 : sharedUsers.length - 1));
        } else if (key.name === "down" || key.name === "j") {
          setCollabSelectedIndex((prev) => (prev < sharedUsers.length - 1 ? prev + 1 : 0));
        }
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
    }
  });

  const getShortcuts = () => {
    const base = [
      { key: "↑/k", description: "up" },
      { key: "↓/j", description: "down" },
    ];

    if (viewLevel === "environments") {
      return [
        { key: "n", description: "new environment" },
        { key: "c", description: "collaborators" },
        { key: "↵", description: "enter" },
        ...base,
        { key: "esc", description: "back" },
      ];
    }
    if (viewLevel === "environment") {
      return [
        { key: "f", description: "new folder" },
        { key: "s", description: "new secret" },
        { key: "c", description: "collaborators" },
        { key: "↵", description: "enter" },
        ...base,
        { key: "esc", description: "back" },
      ];
    }
    return [
      { key: "s", description: "new secret" },
      { key: "c", description: "collaborators" },
      ...base,
      { key: "esc", description: "back" },
    ];
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
        height={4}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="column"
        justifyContent="center"
        backgroundColor={THEME_COLORS.header}
      >
        <text>
          <span fg={THEME_COLORS.primary}>relic</span>
          <span fg={THEME_COLORS.textDim}> / </span>
          <span fg={THEME_COLORS.text}>
            <strong>{projectName}</strong>
          </span>
        </text>
        <text>
          <span fg={STATUS_COLORS[projectStatus]}>
            {projectStatus === "owned" ? "●" : projectStatus === "shared" ? "◐" : "○"}{" "}
            {projectStatus}
          </span>
          <span fg={THEME_COLORS.textDim}> · </span>
          <span fg={THEME_COLORS.textMuted}>{environments.length} environments</span>
          <span fg={THEME_COLORS.textDim}> · </span>
          <span fg={THEME_COLORS.textMuted}>{secrets.length} secrets</span>
        </text>
      </box>

      <box height={1} paddingLeft={2} marginTop={1}>
        <text>
          <span fg={THEME_COLORS.textDim}>relic / {projectName}</span>
          {selectedEnv && <span fg={THEME_COLORS.textDim}> / </span>}
          {selectedEnv && <span fg={THEME_COLORS.secondary}>{selectedEnv.name}</span>}
          {selectedFolder && <span fg={THEME_COLORS.textDim}> / </span>}
          {selectedFolder && <span fg={THEME_COLORS.accent}>{selectedFolder.name}</span>}
        </text>
      </box>

      <box height={1} paddingLeft={2} marginTop={1}>
        <text fg={THEME_COLORS.textMuted}>
          {viewLevel === "environments" && "─ Environments"}
          {viewLevel === "environment" && "─ Folders & Secrets"}
          {viewLevel === "folder" && "─ Secrets"}
        </text>
      </box>

      <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        {items.length === 0 ? (
          <text fg={THEME_COLORS.textDim}>Empty. Use shortcuts below to create items.</text>
        ) : (
          items.map((item, index) => {
            const indicator = getTypeIndicator(item.type);
            const isSelected = index === selectedIndex;
            const canEnter = item.type !== "secret";

            return (
              <box key={item.id} height={1}>
                <text>
                  <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                    {isSelected && canEnter ? "› " : "  "}
                  </span>
                  <span fg={indicator.color}>{indicator.prefix}</span>
                  <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                    {" "}
                    {item.name}
                  </span>
                </text>
              </box>
            );
          })
        )}
      </box>

      <box height={6} flexDirection="row" paddingLeft={2} paddingRight={2} gap={2}>
        <box flexDirection="column" width="50%">
          <text fg={THEME_COLORS.textDim}>─ Collaborators [{sharedUsers.length}]</text>
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            {sharedUsers.length > 0 ? (
              sharedUsers.slice(0, 3).map((user) => (
                <text key={user.email} fg={THEME_COLORS.textMuted}>
                  {user.email}
                </text>
              ))
            ) : (
              <text fg={THEME_COLORS.textDim}>none</text>
            )}
          </box>
        </box>

        <box flexDirection="column" width="50%">
          <text fg={THEME_COLORS.textDim}>─ Activity</text>
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            {logs.slice(0, 3).map((log) => (
              <text key={log.id} fg={THEME_COLORS.textMuted}>
                {log.action.split(".")[1]} · {log.user}
              </text>
            ))}
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
        onClose={closeModal}
      />

      <ManageCollaboratorsModal
        visible={activeModal === "manageCollaborators"}
        collaborators={sharedUsers}
        selectedIndex={collabSelectedIndex}
        isAddMode={collabAddMode}
        addEmail={collabEmailInput.value}
        addEmailCursor={collabEmailInput.cursor}
        cursorVisible={cursorVisible}
        onClose={closeModal}
      />

      {activeModal === "none" && <GuideBar shortcuts={getShortcuts()} />}
    </box>
  );
}
