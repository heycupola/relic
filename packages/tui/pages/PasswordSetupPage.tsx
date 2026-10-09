/** @jsxImportSource @opentui/react */
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { verifyPasswordWithExistingKeys } from "@repo/auth";
import { createUserKeys } from "@repo/crypto";
import { createLogger, trackEvent } from "@repo/logger";
import { useState } from "react";
import { getProtectedApi } from "../api";
import { PasswordInput } from "../components/PasswordInput";
import { Modal } from "../components/shared/Modal";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import { THEME_COLORS } from "../utils/constants";

const logger = createLogger("tui");

interface PasswordSetupPageProps {
  hasExistingKeys: boolean;
  onComplete: (password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

type TaskStatus = null | "checking_password" | "creating_keys" | "saving_password";

const TASK_MESSAGES: Record<Exclude<TaskStatus, null>, string> = {
  checking_password: "Checking password...",
  creating_keys: "Creating encryption keys...",
  saving_password: "Saving password on this device...",
};

const FORM_WIDTH = 46;

export function PasswordSetupPage({
  hasExistingKeys,
  onComplete,
  onLogout,
}: PasswordSetupPageProps) {
  const { width, height } = useTerminalDimensions();
  const { encryptedPrivateKey, salt, checkHasKeys, storeUserKeys } = useUserKeys();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(null);
  const [error, setError] = useState<string | null>(null);

  const complete = async (password: string) => {
    setTaskStatus("saving_password");
    try {
      await onComplete(password);
    } catch (err) {
      logger.error("Failed to save password locally:", err);
      setError("Couldn't save your password on this device. Please try again.");
    } finally {
      setTaskStatus(null);
    }
  };

  const loadStoredKeys = async (): Promise<{
    encryptedPrivateKey: string;
    salt: string;
  } | null> => {
    if (encryptedPrivateKey && salt) return { encryptedPrivateKey, salt };
    const api = getProtectedApi();
    await api.ensureAuth();
    const user = await api.getCurrentUser();
    return user.encryptedPrivateKey && user.salt
      ? { encryptedPrivateKey: user.encryptedPrivateKey, salt: user.salt }
      : null;
  };

  const unlock = async (password: string) => {
    const keys = await loadStoredKeys();
    if (!keys) {
      setError("Could not load your encryption keys. Please try again.");
      return;
    }
    if (!(await verifyPasswordWithExistingKeys(password, keys.encryptedPrivateKey, keys.salt))) {
      trackEvent("password_unlock_failed");
      setError("Incorrect password");
      return;
    }
    await complete(password);
  };

  const handlePasswordSubmit = async (password: string) => {
    if (taskStatus) return;
    setError(null);
    setTaskStatus("checking_password");

    try {
      if (hasExistingKeys || (await checkHasKeys())) {
        await unlock(password);
        return;
      }

      trackEvent("password_setup_started");
      setTaskStatus("creating_keys");
      const keys = await createUserKeys(password);
      await storeUserKeys(keys);
      await complete(password);
    } catch (err) {
      logger.error("Error preparing account:", err);
      setError("Failed to prepare your account. Please try again.");
    } finally {
      setTaskStatus(null);
    }
  };

  useKeyboard((key) => {
    if (taskStatus) return;

    if (showLogoutModal) {
      if (key.name === "y") {
        void onLogout().catch((err) => logger.error("Logout failed:", err));
      } else if (key.name === "n" || key.name === "escape") {
        setShowLogoutModal(false);
      }
      return;
    }

    if ((key.name === "l" && key.ctrl) || key.sequence === "\x0C") {
      setShowLogoutModal(true);
    }
  });

  const isAnyModalOpen = showLogoutModal || !!taskStatus;

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
          width={FORM_WIDTH + 4}
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          <box height={1} marginTop={1}>
            <text fg={THEME_COLORS.text}>
              {hasExistingKeys ? "Unlock master password" : "Create master password"}
            </text>
          </box>

          <box height={1} marginTop={1}>
            <text fg={hasExistingKeys ? THEME_COLORS.textMuted : THEME_COLORS.warning}>
              {hasExistingKeys
                ? "Enter your master password to unlock this device."
                : "Create a password to generate your encryption keys."}
            </text>
          </box>

          <box flexDirection="column" width={FORM_WIDTH} marginTop={1}>
            <PasswordInput
              mode={hasExistingKeys ? "verify" : "setup"}
              onSubmit={(password) => void handlePasswordSubmit(password)}
              width={FORM_WIDTH}
              disabled={isAnyModalOpen}
              error={error}
              additionalShortcuts={[{ key: "^l", description: "logout", disabled: !!taskStatus }]}
            />
          </box>
        </box>
      </box>

      {taskStatus && (
        <box
          position="absolute"
          bottom={0}
          left={0}
          width={width}
          height={1}
          backgroundColor={THEME_COLORS.header}
        >
          <text fg={THEME_COLORS.warning}>{TASK_MESSAGES[taskStatus]}</text>
        </box>
      )}

      <Modal
        visible={showLogoutModal}
        title="Logout"
        width={45}
        height={8}
        shortcuts={[
          { key: "y", description: "yes", disabled: !!taskStatus },
          { key: "n", description: "no", disabled: !!taskStatus },
        ]}
      >
        <text fg={THEME_COLORS.textMuted}>Are you sure you want to logout?</text>
      </Modal>
    </box>
  );
}
