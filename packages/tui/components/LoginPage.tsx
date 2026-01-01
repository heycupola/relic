import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { THEME_COLORS } from "../lib/constants";
import { GuideBar } from "./GuideBar";
import { Modal } from "./Modal";

const OAUTH_URLS = {
  google:
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code&scope=email%20profile",
  github:
    "https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&scope=user:email",
};

const LOGIN_OPTIONS = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const;

const SHORTCUT_GROUPS = {
  primary: [{ shortcuts: [{ key: "↵", description: "sign in" }] }],
  secondary: [],
};

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
          alignItems="center"
          backgroundColor={THEME_COLORS.header}
          width={50}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          <box height={1} marginBottom={1}>
            <text fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</text>
          </box>

          <box flexDirection="column" width={44} marginTop={1}>
            <box flexDirection="column">
              {LOGIN_OPTIONS.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <box key={option.id} height={1} width={22}>
                    <text>
                      <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                        {isSelected ? "› " : "  "}
                      </span>
                      <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                        Login with {option.label}
                      </span>
                    </text>
                  </box>
                );
              })}
            </box>
          </box>

          {/* Shortcuts - inside card, minimal */}
          {!deviceAuth.isOpen && (
            <box marginTop={1}>
              <GuideBar groups={SHORTCUT_GROUPS} customWidth={44} minimal={true} />
            </box>
          )}
        </box>
      </box>

      <Modal visible={deviceAuth.isOpen} title="Device Authorization" width={55} height={12}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={THEME_COLORS.textMuted}>
            Enter this code to sign in with {deviceAuth.provider}:
          </text>
          <box height={1} />
          <box paddingLeft={3} paddingRight={3} height={1}>
            <text fg={THEME_COLORS.primary}>
              <strong> {deviceAuth.userCode.split("").join(" ")} </strong>
            </text>
          </box>
          <box height={1} />
          <text fg={THEME_COLORS.textDim}>Waiting for authorization...</text>
        </box>
      </Modal>
    </box>
  );
}
