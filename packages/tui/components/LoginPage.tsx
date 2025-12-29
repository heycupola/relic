import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { GuideBar } from "./GuideBar";
import { LoginButton } from "./LoginButton";
import { Modal } from "./Modal";

const OAUTH_URLS = {
  google:
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code&scope=email%20profile",
  github:
    "https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&scope=user:email",
};

const LOGIN_OPTIONS = [
  { id: "google", label: "Login with Google" },
  { id: "github", label: "Login with GitHub" },
] as const;

const SHORTCUTS = [
  { key: "↑/k", description: "Up" },
  { key: "↓/j", description: "Down" },
  { key: "↵", description: "Select" },
  { key: "q", description: "Quit" },
];

const MODAL_SHORTCUTS = [{ key: "Esc", description: "Cancel" }];

interface DeviceAuthState {
  isOpen: boolean;
  userCode: string;
  provider: string;
}

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { width, height } = useTerminalDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthState>({
    isOpen: false,
    userCode: "",
    provider: "",
  });

  const moveUp = () => {
    if (deviceAuth.isOpen) return;
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : LOGIN_OPTIONS.length - 1));
  };

  const moveDown = () => {
    if (deviceAuth.isOpen) return;
    setSelectedIndex((prev) => (prev < LOGIN_OPTIONS.length - 1 ? prev + 1 : 0));
  };

  const closeModal = () => {
    setDeviceAuth({ isOpen: false, userCode: "", provider: "" });
  };

  const openAuthUrl = async () => {
    if (deviceAuth.isOpen) return;

    const option = LOGIN_OPTIONS[selectedIndex];
    if (!option) return;

    const userCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    setDeviceAuth({
      isOpen: true,
      userCode,
      provider: option.id === "google" ? "Google" : "GitHub",
    });

    const url = OAUTH_URLS[option.id];

    try {
      const platform = process.platform;
      const command =
        platform === "darwin"
          ? ["open", url]
          : platform === "win32"
            ? ["cmd", "/c", "start", url]
            : ["xdg-open", url];

      Bun.spawn(command);
    } catch (error) {
      console.error("Failed to open browser:", error);
    }
  };

  const simulateLogin = () => {
    onLogin();
  };

  useKeyboard((key) => {
    if (deviceAuth.isOpen) {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "d") {
        simulateLogin();
      }
      return;
    }

    if (key.name === "k" || key.name === "up") {
      moveUp();
    } else if (key.name === "j" || key.name === "down") {
      moveDown();
    } else if (key.name === "return") {
      openAuthUrl();
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const currentShortcuts = deviceAuth.isOpen ? MODAL_SHORTCUTS : SHORTCUTS;

  return (
    <box flexDirection="column" width={width} height={height} backgroundColor="#0f0f14">
      <box
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
        backgroundColor="#0f0f14"
      >
        <box
          flexDirection="column"
          alignItems="center"
          borderStyle="single"
          borderColor="#3b4261"
          backgroundColor="#1a1b26"
          width={50}
        >
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          {/* <box height={1}>
                        <text fg="#c0caf5">
                            <strong>Welcome to Relic</strong>
                        </text>
                    </box> */}

          <box height={1}>
            <text fg="#565f89">Zero-knowledge secret management</text>
          </box>

          <box flexDirection="column" marginTop={1} marginBottom={1}>
            {LOGIN_OPTIONS.map((option, index) => (
              <LoginButton
                key={option.id}
                label={option.label}
                selected={index === selectedIndex}
              />
            ))}
          </box>
        </box>
      </box>

      <Modal visible={deviceAuth.isOpen} title="Device Authorization" width={55} height={14}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg="#565f89">A browser window has been opened.</text>
          <text fg="#565f89">Enter this code to sign in with {deviceAuth.provider}:</text>
          <box height={1} />
          <box
            borderStyle="single"
            borderColor="#7aa2f7"
            paddingLeft={2}
            paddingRight={2}
            height={3}
            justifyContent="center"
            alignItems="center"
          >
            <text fg="#7aa2f7">
              <strong>{deviceAuth.userCode}</strong>
            </text>
          </box>
          <box height={1} />
          <text fg="#3b4261">Waiting for authorization...</text>
        </box>
      </Modal>

      <GuideBar shortcuts={currentShortcuts} />
    </box>
  );
}
