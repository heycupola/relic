import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import open from "open";
import { useEffect, useRef, useState } from "react";
import { GuideBar } from "../components/shared/GuideBar";
import { LoginButton } from "../components/shared/LoginButton";
import { Modal } from "../components/shared/Modal";
import { type DeviceAuthStatus, useDeviceAuth } from "../convex";
import { KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";
import { logger } from "../utils/debugLog";
import { createHyperlink } from "../utils/hyperlink";

const getShortcutGroups = (isLoading: boolean) => ({
  primary: [
    { shortcuts: [{ key: KEY_SYMBOLS.enter, description: "sign in", disabled: isLoading }] },
  ],
  secondary: [{ shortcuts: [{ key: "↑↓", description: "navigate", disabled: isLoading }] }],
});

type Provider = "google" | "github";

interface LoginPageProps {
  onLogin: () => void;
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
      return "Code expired. Press ESC to try again.";
    case "error":
      return "An error occurred. Press ESC to try again.";
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const providers: Provider[] = ["google", "github"];

  const { status, userCode, verificationUri, isLoading, error, startAuth, cancel } = useDeviceAuth({
    onSuccess: () => {
      setTimeout(() => {
        onLogin();
      }, 500);
    },
    onError: (err) => {
      logger.error("Device auth error:", err);
    },
  });

  const hyperlinkWrittenRef = useRef<string | null>(null);

  // Write hyperlink escape sequences directly to terminal for Cmd+Click support
  // The TUI library sanitizes escape sequences in text components, so we need to
  // write them directly to stdout after the TUI renders
  useEffect(() => {
    if (verificationUri && isModalOpen && hyperlinkWrittenRef.current !== verificationUri) {
      const timer = setTimeout(() => {
        const hyperlink = createHyperlink(verificationUri, verificationUri);
        try {
          process.stdout.write(hyperlink);
          hyperlinkWrittenRef.current = verificationUri;
        } catch {
          // ignore
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [verificationUri, isModalOpen]);

  const closeModal = () => {
    cancel();
    setIsModalOpen(false);
    setSelectedProviderIndex(0);
  };

  const handleLogin = async (_provider?: Provider) => {
    if (isModalOpen) return;
    setIsModalOpen(true);
    try {
      await startAuth();
    } catch (err) {
      logger.error("Failed to start auth:", err);
    }
  };

  useKeyboard((key) => {
    if (isModalOpen) {
      if (key.name === "escape") {
        closeModal();
      } else if (key.name === "return" && verificationUri) {
        open(verificationUri);
      }
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedProviderIndex((prev) => (prev > 0 ? prev - 1 : providers.length - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedProviderIndex((prev) => (prev < providers.length - 1 ? prev + 1 : 0));
    } else if (key.name === "return") {
      handleLogin(providers[selectedProviderIndex]);
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  const formattedCode = userCode
    ? userCode.includes("-")
      ? userCode
      : userCode.length === 8
        ? `${userCode.slice(0, 4)}-${userCode.slice(4)}`
        : userCode
    : "...";
  const providerLabels: Record<Provider, string> = {
    google: "Sign in with Google",
    github: "Sign in with GitHub",
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
            <text fg={THEME_COLORS.textMuted}>Zero-knowledge secret management</text>
          </box>

          <box flexDirection="column" width={52} marginTop={1} gap={0}>
            {providers.map((provider, index) => (
              <LoginButton
                key={provider}
                label={providerLabels[provider]}
                selected={selectedProviderIndex === index}
              />
            ))}
          </box>

          {!isModalOpen && (
            <box marginTop={1}>
              <GuideBar groups={getShortcutGroups(isLoading)} customWidth={52} minimal={true} />
            </box>
          )}
        </box>
      </box>

      <Modal
        visible={isModalOpen}
        title="Device Authorization"
        width={verificationUri ? Math.min(Math.max(verificationUri.length + 10, 50), 80) : 60}
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
                <box flexDirection="column" marginTop={1} gap={0}>
                  <box height={1} marginTop={0}>
                    <text fg={THEME_COLORS.textMuted}>
                      {verificationUri.length > 70
                        ? `${verificationUri.substring(0, 70)}...`
                        : verificationUri}
                    </text>
                  </box>
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
            <box height={1} marginTop={0}>
              <text fg={THEME_COLORS.error}>
                Error: {error.message || "Failed to connect to server"}
              </text>
            </box>
          )}
          {(status === "expired" || status === "error" || status === "denied" || error) && (
            <box height={1} marginTop={0}>
              <text fg={THEME_COLORS.textDim}>Press ESC to close</text>
            </box>
          )}
        </box>
      </Modal>
    </box>
  );
}
