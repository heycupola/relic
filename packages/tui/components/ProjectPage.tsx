import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { GuideBar } from "./GuideBar";
import { Modal } from "./Modal";

type ViewLevel = "environments" | "environment" | "folder";
type ModalType = "none" | "createEnv" | "createFolder" | "createSecret";

interface Environment {
  id: string;
  name: string;
}

interface Folder {
  id: string;
  name: string;
  environmentId: string;
}

interface Secret {
  id: string;
  key: string;
  folderId?: string;
  environmentId: string;
}

interface SharedUser {
  email: string;
  name: string;
}

interface LogEntry {
  id: string;
  action: string;
  timestamp: number;
  user: string;
}

interface ProjectPageProps {
  projectId: string;
  projectName: string;
  projectStatus: "owned" | "shared" | "archived";
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
  { email: "john@example.com", name: "John" },
  { email: "jane@example.com", name: "Jane" },
];

const MOCK_LOGS: LogEntry[] = [
  { id: "l1", action: "secret.created", timestamp: Date.now() - 3600000, user: "you" },
  { id: "l2", action: "folder.created", timestamp: Date.now() - 7200000, user: "john@example.com" },
];

const STATUS_COLORS = {
  owned: "#9ece6a",
  shared: "#7aa2f7",
  archived: "#565f89",
};

export function ProjectPage({
  projectId: _projectId,
  projectName,
  projectStatus,
  onBack,
}: ProjectPageProps) {
  const { width, height } = useTerminalDimensions();

  const [environments] = useState<Environment[]>(MOCK_ENVIRONMENTS);
  const [folders] = useState<Folder[]>(MOCK_FOLDERS);
  const [secrets] = useState<Secret[]>(MOCK_SECRETS);
  const [sharedUsers] = useState<SharedUser[]>(MOCK_SHARED_USERS);
  const [logs] = useState<LogEntry[]>(MOCK_LOGS);

  const [viewLevel, setViewLevel] = useState<ViewLevel>("environments");
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [activeModal, setActiveModal] = useState<ModalType>("none");
  const [newEnvName, setNewEnvName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [secretInputFocus, setSecretInputFocus] = useState<"key" | "value">("key");

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

  const getBreadcrumb = () => {
    const parts: string[] = [];
    if (selectedEnv) parts.push(selectedEnv.name);
    if (selectedFolder) parts.push(selectedFolder.name);
    return parts.length > 0 ? parts.join(" / ") : "Select Environment";
  };

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
    setNewEnvName("");
    setNewFolderName("");
    setNewSecretKey("");
    setNewSecretValue("");
    setSecretInputFocus("key");
  };

  const handleCreateEnv = () => {
    if (newEnvName.trim()) {
      console.log("Creating environment:", newEnvName);
      closeModal();
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      console.log("Creating folder:", newFolderName);
      closeModal();
    }
  };

  const handleCreateSecret = () => {
    if (newSecretKey.trim() && newSecretValue.trim()) {
      console.log("Creating secret:", newSecretKey, newSecretValue);
      closeModal();
    }
  };

  useKeyboard((key) => {
    if (activeModal === "createEnv") {
      if (key.name === "escape") closeModal();
      else if (key.name === "return") handleCreateEnv();
      else if (key.name === "backspace") setNewEnvName((prev) => prev.slice(0, -1));
      else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setNewEnvName((prev) => prev + key.sequence);
      }
      return;
    }

    if (activeModal === "createFolder") {
      if (key.name === "escape") closeModal();
      else if (key.name === "return") handleCreateFolder();
      else if (key.name === "backspace") setNewFolderName((prev) => prev.slice(0, -1));
      else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setNewFolderName((prev) => prev + key.sequence);
      }
      return;
    }

    if (activeModal === "createSecret") {
      if (key.name === "escape") closeModal();
      else if (key.name === "tab") {
        setSecretInputFocus((prev) => (prev === "key" ? "value" : "key"));
      } else if (key.name === "return") handleCreateSecret();
      else if (key.name === "backspace") {
        if (secretInputFocus === "key") setNewSecretKey((prev) => prev.slice(0, -1));
        else setNewSecretValue((prev) => prev.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        if (secretInputFocus === "key") setNewSecretKey((prev) => prev + key.sequence);
        else setNewSecretValue((prev) => prev + key.sequence);
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
    }
  });

  const getShortcuts = () => {
    const base = [
      { key: "↑/k", description: "Up" },
      { key: "↓/j", description: "Down" },
    ];

    if (viewLevel === "environments") {
      return [
        { key: "n", description: "New Env" },
        { key: "↵", description: "Enter" },
        ...base,
        { key: "Esc", description: "Back" },
      ];
    }
    if (viewLevel === "environment") {
      return [
        { key: "f", description: "New Folder" },
        { key: "s", description: "New Secret" },
        { key: "↵", description: "Enter" },
        ...base,
        { key: "Esc", description: "Back" },
      ];
    }
    return [{ key: "s", description: "New Secret" }, ...base, { key: "Esc", description: "Back" }];
  };

  const getTypeIndicator = (type: "env" | "folder" | "secret") => {
    if (type === "env") return { prefix: "[E]", color: "#bb9af7" };
    if (type === "folder") return { prefix: "[/]", color: "#e0af68" };
    return { prefix: "[*]", color: "#9ece6a" };
  };

  return (
    <box flexDirection="column" width={width} height={height} backgroundColor="#0f0f14">
      {/* Header */}
      <box
        height={3}
        paddingLeft={2}
        paddingRight={2}
        alignItems="center"
        backgroundColor="#1a1b26"
      >
        <box flexDirection="row" justifyContent="space-between" width={width - 4}>
          <text>
            <span fg="#7aa2f7">
              <strong>relic</strong>
            </span>
            <span fg="#3b4261"> / </span>
            <span fg="#c0caf5">{projectName}</span>
          </text>
          <text fg={STATUS_COLORS[projectStatus]}>{projectStatus}</text>
        </box>
      </box>

      {/* Breadcrumb */}
      <box height={1} paddingLeft={2}>
        <text fg="#565f89">{getBreadcrumb()}</text>
      </box>

      {/* Main content list */}
      <box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
        {items.length === 0 ? (
          <text fg="#3b4261">Empty. Use shortcuts below to create items.</text>
        ) : (
          items.map((item, index) => {
            const indicator = getTypeIndicator(item.type);
            const isSelected = index === selectedIndex;
            const canEnter = item.type !== "secret";

            return (
              <box key={item.id} height={1}>
                <text>
                  <span fg={isSelected ? "#7aa2f7" : "#3b4261"}>
                    {isSelected && canEnter ? "› " : "  "}
                  </span>
                  <span fg={indicator.color}>{indicator.prefix}</span>
                  <span fg={isSelected ? "#c0caf5" : "#565f89"}> {item.name}</span>
                </text>
              </box>
            );
          })
        )}
      </box>

      {/* Footer panels */}
      <box height={6} flexDirection="row" paddingLeft={2} paddingRight={2} gap={2}>
        <box flexDirection="column" width="50%">
          <text fg="#3b4261">─ Collaborators [{sharedUsers.length}]</text>
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            {sharedUsers.length > 0 ? (
              sharedUsers.slice(0, 3).map((user) => (
                <text key={user.email} fg="#565f89">
                  {user.email}
                </text>
              ))
            ) : (
              <text fg="#3b4261">none</text>
            )}
          </box>
        </box>

        <box flexDirection="column" width="50%">
          <text fg="#3b4261">─ Activity</text>
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            {logs.slice(0, 3).map((log) => (
              <text key={log.id} fg="#565f89">
                {log.action.split(".")[1]} · {log.user}
              </text>
            ))}
          </box>
        </box>
      </box>

      <Modal
        visible={activeModal === "createEnv"}
        title="Create Environment"
        width={50}
        height={10}
      >
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#565f89">Environment name:</text>
          <box
            width={40}
            height={3}
            borderStyle="single"
            borderColor="#7aa2f7"
            backgroundColor="#292e42"
            paddingLeft={1}
            alignItems="center"
          >
            <text fg="#c0caf5">
              {newEnvName}
              <span fg="#7aa2f7">_</span>
            </text>
          </box>
          <box flexDirection="row" gap={2}>
            <text>
              <span fg="#9ece6a">[↵]</span>
              <span fg="#565f89"> Create</span>
            </text>
            <text>
              <span fg="#f7768e">[Esc]</span>
              <span fg="#565f89"> Cancel</span>
            </text>
          </box>
        </box>
      </Modal>

      <Modal visible={activeModal === "createFolder"} title="Create Folder" width={50} height={10}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#565f89">Folder name:</text>
          <box
            width={40}
            height={3}
            borderStyle="single"
            borderColor="#7aa2f7"
            backgroundColor="#292e42"
            paddingLeft={1}
            alignItems="center"
          >
            <text fg="#c0caf5">
              {newFolderName}
              <span fg="#7aa2f7">_</span>
            </text>
          </box>
          <box flexDirection="row" gap={2}>
            <text>
              <span fg="#9ece6a">[↵]</span>
              <span fg="#565f89"> Create</span>
            </text>
            <text>
              <span fg="#f7768e">[Esc]</span>
              <span fg="#565f89"> Cancel</span>
            </text>
          </box>
        </box>
      </Modal>

      <Modal visible={activeModal === "createSecret"} title="Create Secret" width={50} height={14}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#565f89">Secret Key:</text>
          <box
            width={40}
            height={3}
            borderStyle="single"
            borderColor={secretInputFocus === "key" ? "#7aa2f7" : "#3b4261"}
            backgroundColor="#292e42"
            paddingLeft={1}
            alignItems="center"
          >
            <text fg="#c0caf5">
              {newSecretKey}
              {secretInputFocus === "key" && <span fg="#7aa2f7">_</span>}
            </text>
          </box>
          <text fg="#565f89">Secret Value:</text>
          <box
            width={40}
            height={3}
            borderStyle="single"
            borderColor={secretInputFocus === "value" ? "#7aa2f7" : "#3b4261"}
            backgroundColor="#292e42"
            paddingLeft={1}
            alignItems="center"
          >
            <text fg="#c0caf5">
              {newSecretValue}
              {secretInputFocus === "value" && <span fg="#7aa2f7">_</span>}
            </text>
          </box>
          <box flexDirection="row" gap={2}>
            <text>
              <span fg="#9ece6a">[↵]</span>
              <span fg="#565f89"> Create</span>
            </text>
            <text>
              <span fg="#bb9af7">[Tab]</span>
              <span fg="#565f89"> Switch</span>
            </text>
            <text>
              <span fg="#f7768e">[Esc]</span>
              <span fg="#565f89"> Cancel</span>
            </text>
          </box>
        </box>
      </Modal>

      {activeModal === "none" && <GuideBar shortcuts={getShortcuts()} />}
    </box>
  );
}
