import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { PasswordForm } from "../components/forms/PasswordForm";
import { Modal } from "../components/shared/Modal";
import { THEME_COLORS } from "../utils/constants";

interface PasswordSetupPageProps {
  onComplete: (password: string) => void;
  onLogout: () => Promise<void>;
}

export function PasswordSetupPage({ onComplete, onLogout }: PasswordSetupPageProps) {
  const { width, height } = useTerminalDimensions();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    await onLogout();
  };

  useKeyboard((key) => {
    // Logout confirmation modal handlers
    if (showLogoutModal) {
      if (key.name === "y") {
        handleLogout();
        return;
      } else if (key.name === "n" || key.name === "escape") {
        setShowLogoutModal(false);
        return;
      }
    }

    // Logout shortcut - only handle if modal is not open
    if (!showLogoutModal && ((key.name === "l" && key.ctrl) || key.sequence === "\x0C")) {
      setShowLogoutModal(true);
      return;
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
          backgroundColor={THEME_COLORS.header}
          width={50}
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          <box height={1} marginTop={1}>
            <text fg={THEME_COLORS.text}>Set Your Password</text>
          </box>

          <box height={1} marginTop={1}>
            <text>
              <span fg={THEME_COLORS.accent}>[!]</span>
              <span fg={THEME_COLORS.accent}> Your master password is never stored</span>
            </text>
          </box>

          <box flexDirection="column" width={46} marginTop={1}>
            <PasswordForm mode="setup" onSubmit={onComplete} width={46} />
          </box>
        </box>
      </box>

      {/* Logout confirmation modal */}
      <Modal
        visible={showLogoutModal}
        title="Logout"
        width={45}
        height={8}
        shortcuts={[
          { key: "y", description: "yes" },
          { key: "n", description: "no" },
        ]}
      >
        <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
      </Modal>
    </box>
  );
}
