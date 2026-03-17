import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { verifyPasswordWithExistingKeys } from "@repo/auth";
import {
  createUserKeys,
  decryptPrivateKeyWithPassword,
  encryptPrivateKeyWithPassword,
  generateSalt,
} from "@repo/crypto";
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

type TaskStatus =
  | null
  | "checking_password"
  | "creating_keys"
  | "verifying_old_password"
  | "rewrapping_key"
  | "updating_backend";

export function PasswordSetupPage({
  hasExistingKeys,
  onComplete,
  onLogout,
}: PasswordSetupPageProps) {
  const { width, height } = useTerminalDimensions();
  const { encryptedPrivateKey, salt, checkHasKeys, updatePassword, storeUserKeys } = useUserKeys();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPasswordWarning, setShowPasswordWarning] = useState(false);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [currentEncryptedPrivateKey, setCurrentEncryptedPrivateKey] = useState<string | null>(null);
  const [currentSalt, setCurrentSalt] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [rewrapError, setRewrapError] = useState<string | null>(null);

  const handleLogout = async () => {
    await onLogout();
  };

  const handlePasswordSubmit = async (password: string) => {
    trackEvent("password_setup_started");
    setSetupError(null);
    setTaskStatus("checking_password");

    try {
      const hasKeys = await checkHasKeys();

      if (!hasKeys) {
        setTaskStatus("creating_keys");
        try {
          const {
            publicKey,
            encryptedPrivateKey: newEncryptedPrivateKey,
            salt: newSalt,
          } = await createUserKeys(password);

          await storeUserKeys({
            publicKey,
            encryptedPrivateKey: newEncryptedPrivateKey,
            salt: newSalt,
          });

          setTaskStatus(null);
          await onComplete(password);
          return;
        } catch (error) {
          logger.error("Failed to create user keys:", error);
          setTaskStatus(null);
          throw error;
        }
      }

      let storedEncryptedPrivateKey: string | null = null;
      let storedSalt: string | null = null;

      if (!encryptedPrivateKey || !salt) {
        const api = getProtectedApi();
        await api.ensureAuth();
        const user = await api.getCurrentUser();
        if (user.encryptedPrivateKey && user.salt) {
          storedEncryptedPrivateKey = user.encryptedPrivateKey;
          storedSalt = user.salt;
        }
      } else {
        storedEncryptedPrivateKey = encryptedPrivateKey;
        storedSalt = salt;
      }

      if (storedEncryptedPrivateKey && storedSalt) {
        const isSamePassword = await verifyPasswordWithExistingKeys(
          password,
          storedEncryptedPrivateKey,
          storedSalt,
        );

        if (isSamePassword) {
          setTaskStatus(null);
          await onComplete(password);
          return;
        }

        setPendingPassword(password);
        setCurrentEncryptedPrivateKey(storedEncryptedPrivateKey);
        setCurrentSalt(storedSalt);
        setTaskStatus(null);
        setShowPasswordWarning(true);
        setRewrapError(null);
        return;
      }

      setTaskStatus(null);
      setSetupError("Could not load your encryption keys. Please try again.");
    } catch (error) {
      logger.error("Error checking password:", error);
      setTaskStatus(null);
      setSetupError("Failed to prepare your account. Please try again.");
    }
  };

  const handleWarningConfirm = async (oldPassword: string) => {
    if (!pendingPassword || !currentEncryptedPrivateKey || !currentSalt) {
      return;
    }

    if (oldPassword === pendingPassword) {
      setRewrapError("Must be different from new password");
      return;
    }

    setRewrapError(null);
    setTaskStatus("verifying_old_password");

    let privateKey: CryptoKey;
    try {
      privateKey = await decryptPrivateKeyWithPassword(
        currentEncryptedPrivateKey,
        oldPassword,
        currentSalt,
      );
    } catch (error) {
      logger.error("Failed to verify old password:", error);
      setTaskStatus(null);
      setRewrapError("Incorrect password. Please try again.");
      return;
    }

    setTaskStatus("rewrapping_key");

    try {
      const newSalt = generateSalt();
      const newEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
        privateKey,
        pendingPassword,
        newSalt,
      );

      setTaskStatus("updating_backend");

      await updatePassword({
        encryptedPrivateKey: newEncryptedPrivateKey,
        salt: newSalt,
      });

      setTaskStatus(null);
      setShowPasswordWarning(false);
      await onComplete(pendingPassword);
    } catch (error) {
      logger.error("Failed to rewrap password:", error);
      setTaskStatus(null);
      setRewrapError("Failed to update password. Please try again.");
    }
  };

  const handleWarningCancel = () => {
    setShowPasswordWarning(false);
    setPendingPassword(null);
    setCurrentEncryptedPrivateKey(null);
    setCurrentSalt(null);
    setRewrapError(null);
  };

  useKeyboard((key) => {
    if (showPasswordWarning || taskStatus) {
      return;
    }

    if (showLogoutModal) {
      if (key.name === "y") {
        handleLogout();
        return;
      } else if (key.name === "n" || key.name === "escape") {
        setShowLogoutModal(false);
        return;
      }
    }

    if (!showLogoutModal && ((key.name === "l" && key.ctrl) || key.sequence === "\x0C")) {
      setShowLogoutModal(true);
      return;
    }
  });

  const isAnyModalOpen = showPasswordWarning || showLogoutModal || !!taskStatus;

  const getTaskStatusMessage = (): string => {
    switch (taskStatus) {
      case "checking_password":
        return "Checking password...";
      case "creating_keys":
        return "Creating encryption keys...";
      case "verifying_old_password":
        return "Verifying old password...";
      case "rewrapping_key":
        return "Rewrapping your private key...";
      case "updating_backend":
        return "Updating password...";
      default:
        return "";
    }
  };

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
          width={50}
          paddingLeft={2}
          paddingRight={2}
          paddingBottom={1}
        >
          <box height={1} marginTop={1}>
            <text fg={THEME_COLORS.text}>
              {hasExistingKeys ? "Unlock Master Password" : "Create Master Password"}
            </text>
          </box>

          <box height={1} marginTop={1}>
            <text fg={hasExistingKeys ? THEME_COLORS.textDim : THEME_COLORS.accent}>
              {hasExistingKeys
                ? "Enter your password to unlock this account."
                : "Create a password to generate your encryption keys."}
            </text>
          </box>

          <box flexDirection="column" width={46} marginTop={1}>
            <PasswordInput
              mode="setup"
              onSubmit={handlePasswordSubmit}
              width={46}
              disabled={isAnyModalOpen}
              error={setupError}
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
          <text fg={THEME_COLORS.accent}>{getTaskStatusMessage()}</text>
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
        <text fg={THEME_COLORS.textDim}>Are you sure you want to logout?</text>
      </Modal>

      {/* NOTE: shortcuts={[]} because PasswordInput has its own GuideBar with contextual labels */}
      <Modal
        visible={showPasswordWarning}
        title="Password Change Warning"
        width={60}
        height={12}
        shortcuts={[]}
      >
        <box flexDirection="column" width={56} gap={1}>
          <text fg={THEME_COLORS.accent}>[!] New password detected</text>
          <text fg={THEME_COLORS.text}>Enter your old password to rewrap your private key</text>
          <PasswordInput
            mode="verify"
            onSubmit={handleWarningConfirm}
            onCancel={handleWarningCancel}
            width={46}
            disabled={!!taskStatus}
            error={rewrapError}
            additionalShortcuts={[{ key: "esc", description: "cancel", disabled: !!taskStatus }]}
          />
        </box>
      </Modal>
    </box>
  );
}
