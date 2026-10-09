/** @jsxImportSource @opentui/react */
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { createLogger, trackEvent } from "@repo/logger";
import { useState } from "react";
import { GuideBar } from "../components/shared/GuideBar";
import { LoginButton } from "../components/shared/LoginButton";
import { Modal } from "../components/shared/Modal";
import { type DeviceAuthStatus, useDeviceAuth } from "../convex/hooks/useDeviceAuth";
import { KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";
import { openUrl } from "../utils/ui";

const logger = createLogger("tui");

const getShortcutGroups = (isLoading: boolean) => ({
  primary: [
    {
      shortcuts: [
        { key: KEY_SYMBOLS.enter, description: "sign in", disabled: isLoading },
        { key: "q", description: "quit" },
      ],
    },
  ],
  secondary: [],
});

interface LoginPageProps {
  onLogin: () => Promise<void>;
}

function getStatusMessage(
  status: DeviceAuthStatus | "idle",
  hasCode: boolean,
  isLoading: boolean,
): string {
  if (isLoading && !hasCode) {
    return "Requesting code from server...";
  }
  if (hasCode && status === "pending") {
    return "Code received! Waiting for authorization...";
  }
  switch (status) {
    case "pending":
      return "Waiting for authorization...";
    case "approved":
      return "Authorization successful!";
    case "denied":
      return "Authorization denied.";
    case "expired":
      return "Code expired. Press esc and sign in again.";
    case "error":
      return "Something went wrong. Press esc and sign in again.";
    default:
      return "";
  }
}

function getStatusColor(
  status: DeviceAuthStatus | "idle",
  hasCode: boolean,
  isLoading: boolean,
): string {
  if (hasCode && status === "pending") {
    return THEME_COLORS.success;
  }
  switch (status) {
    case "approved":
      return THEME_COLORS.success;
    case "denied":
    case "expired":
    case "error":
      return THEME_COLORS.error;
    default:
      return isLoading ? THEME_COLORS.primary : THEME_COLORS.textDim;
  }
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { status, userCode, verificationUri, isLoading, error, startAuth, cancel } = useDeviceAuth({
    onSuccess: () => {
      trackEvent("tui_login_completed", { success: true });
      setTimeout(() => {
        onLogin().catch((err: unknown) => {
          logger.error("Failed to finish login:", err);
        });
      }, 500);
    },
    onError: (err) => {
      logger.error("Device auth error:", err);
      trackEvent("tui_login_completed", { success: false });
    },
  });

  const closeModal = () => {
    cancel();
    setIsModalOpen(false);
  };

  const handleLogin = async () => {
    if (isModalOpen) return;
    setIsModalOpen(true);
    trackEvent("tui_login_started");
    try {
      await startAuth();
    } catch (err) {
      logger.error("Failed to start auth:", err);
      trackEvent("tui_login_completed", { success: false });
    }
  };

  useKeyboard((key) => {
    if (isModalOpen) {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "return" && verificationUri) {
        void openUrl(verificationUri);
      }
      return;
    }

    if (key.name === "return") {
      void handleLogin();
    } else if (key.name === "q") {
      renderer.destroy();
    }
  });

  const formattedCode = userCode
    ? userCode.includes("-")
      ? userCode
      : userCode.length === 8
        ? `${userCode.slice(0, 4)}-${userCode.slice(4)}`
        : userCode
    : "...";

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
          width={56}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          paddingRight={2}
        >
          <box height={7} justifyContent="center" alignItems="center">
            <ascii-font text="relic" font="block" />
          </box>

          <box height={1} marginBottom={0} justifyContent="center" alignItems="center">
            <text fg={THEME_COLORS.textMuted}>The secrets layer</text>
          </box>

          <box flexDirection="column" width={52} marginTop={1} gap={0}>
            <LoginButton label="Sign in" />
          </box>

          {!isModalOpen && (
            <box marginTop={1}>
              <GuideBar groups={getShortcutGroups(isLoading)} customWidth={52} />
            </box>
          )}
        </box>
      </box>

      <Modal
        visible={isModalOpen}
        title="Sign in with your browser"
        width={verificationUri ? Math.min(Math.max(verificationUri.length + 6, 50), 80) : 60}
        shortcuts={[
          {
            key: KEY_SYMBOLS.enter,
            description: "open link",
            disabled: !verificationUri || isLoading,
          },
          { key: "esc", description: "cancel", disabled: isLoading },
        ]}
      >
        <box flexDirection="column" gap={0}>
          {userCode ? (
            <>
              <text fg={THEME_COLORS.textMuted}>
                Visit the URL below and verify this code matches:
              </text>
              <box height={1} marginTop={0} justifyContent="center">
                <text fg={THEME_COLORS.primary}>
                  <strong>{formattedCode}</strong>
                </text>
              </box>
              {verificationUri && (
                <box marginTop={1}>
                  <text fg={THEME_COLORS.link} wrapMode="char">
                    {verificationUri}
                  </text>
                </box>
              )}
            </>
          ) : (
            <text fg={THEME_COLORS.textMuted}>Connecting to server...</text>
          )}
          <box height={1} marginTop={1}>
            <text fg={getStatusColor(status, !!userCode, isLoading)}>
              {getStatusMessage(status, !!userCode, isLoading)}
            </text>
          </box>
          {error && (
            <box marginTop={0}>
              <text fg={THEME_COLORS.error}>
                Error: {error.message || "Failed to connect to server"}
              </text>
            </box>
          )}
        </box>
      </Modal>
    </box>
  );
}
