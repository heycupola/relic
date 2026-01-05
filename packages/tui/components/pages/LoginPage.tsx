import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { type DeviceAuthStatus, useDeviceAuth } from "../../convex";
import { THEME_COLORS } from "../../utils/constants";
import { GuideBar } from "../shared/GuideBar";
import { Modal } from "../shared/Modal";

const SHORTCUT_GROUPS = {
  primary: [{ shortcuts: [{ key: "↵", description: "sign in" }] }],
  secondary: [],
};

interface LoginPageProps {
  onLogin: () => void;
}

function getStatusMessage(status: DeviceAuthStatus | "idle"): string {
  switch (status) {
    case "pending":
      return "Waiting for authorization...";
    case "approved":
      return "Authorization successful!";
    case "denied":
      return "Authorization denied.";
    case "expired":
      return "Code expired. Press ESC to try again.";
    case "error":
      return "An error occurred. Press ESC to try again.";
    default:
      return "";
  }
}

function getStatusColor(status: DeviceAuthStatus | "idle"): string {
  switch (status) {
    case "approved":
      return THEME_COLORS.success;
    case "denied":
    case "expired":
    case "error":
      return THEME_COLORS.error;
    default:
      return THEME_COLORS.textDim;
  }
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { width, height } = useTerminalDimensions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { status, userCode, startAuth, cancel } = useDeviceAuth({
    onSuccess: () => {
      setTimeout(() => {
        onLogin();
      }, 500);
    },
  });

  const closeModal = () => {
    cancel();
    setIsModalOpen(false);
  };

  const handleLogin = async () => {
    if (isModalOpen) return;
    setIsModalOpen(true);
    await startAuth();
  };

  useKeyboard((key) => {
    if (isModalOpen) {
      if (key.name === "escape") {
        closeModal();
      }
      return;
    }

    if (key.name === "return") {
      handleLogin();
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const formattedCode = userCode ? userCode.split("").join(" ") : "...";

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
          width={56}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          <box height={1} marginBottom={1} justifyContent="center" alignItems="center">
            <text fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</text>
          </box>

          <box flexDirection="column" width={52} marginTop={1}>
            <box height={1} width={52} justifyContent="center">
              <text>
                <span fg={THEME_COLORS.primary}>{"› "}</span>
                <span fg={THEME_COLORS.text}>Sign in to continue</span>
              </text>
            </box>
          </box>

          {!isModalOpen && (
            <box marginTop={1}>
              <GuideBar groups={SHORTCUT_GROUPS} customWidth={52} minimal={true} />
            </box>
          )}
        </box>
      </box>

      <Modal visible={isModalOpen} title="Device Authorization" width={55}>
        <box flexDirection="column" gap={1}>
          <text fg={THEME_COLORS.textMuted}>A browser window has been opened.</text>
          <text fg={THEME_COLORS.textMuted}>Enter this code to sign in:</text>
          <box height={1} marginTop={1}>
            <text fg={THEME_COLORS.primary}>
              <strong>{formattedCode}</strong>
            </text>
          </box>
          <box height={1} marginTop={1}>
            <text fg={getStatusColor(status)}>{getStatusMessage(status)}</text>
          </box>
          {(status === "expired" || status === "error" || status === "denied") && (
            <box height={1} marginTop={1}>
              <text fg={THEME_COLORS.textDim}>Press ESC to close</text>
            </box>
          )}
        </box>
      </Modal>
    </box>
  );
}
