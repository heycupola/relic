import { clearPassword, savePassword } from "@repo/auth";
import {
  decryptPrivateKeyWithPassword,
  encryptPrivateKeyWithPassword,
  generateSalt,
} from "@repo/crypto";
import { createLogger, trackEvent } from "@repo/logger";
import { useCallback, useState } from "react";
import { useUser } from "../context";

const logger = createLogger("tui");

interface UseChangePasswordOptions {
  encryptedPrivateKey: string | null;
  salt: string | null;
  updatePassword: (args: { encryptedPrivateKey: string; salt: string }) => Promise<void>;
  onChanged: () => void;
  onLocalSaveFailed: (message: string) => void;
}

export function useChangePassword({
  encryptedPrivateKey,
  salt,
  updatePassword,
  onChanged,
  onLocalSaveFailed,
}: UseChangePasswordOptions) {
  const { user } = useUser();
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (message: string) => {
    setIsChanging(false);
    setError(message);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!encryptedPrivateKey || !salt) {
      setError("Unable to change password: encryption keys not found");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    setError(null);
    setIsChanging(true);

    let privateKey: CryptoKey;
    try {
      privateKey = await decryptPrivateKeyWithPassword(encryptedPrivateKey, currentPassword, salt);
    } catch (err) {
      logger.error("Failed to verify current password:", err);
      fail("Incorrect password");
      return;
    }

    let newEncryptedPrivateKey: string;
    const newSalt = generateSalt();
    try {
      newEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
        privateKey,
        newPassword,
        newSalt,
      );
    } catch (err) {
      logger.error("Failed to rewrap private key:", err);
      fail("Failed to encrypt with new password");
      return;
    }

    try {
      await updatePassword({ encryptedPrivateKey: newEncryptedPrivateKey, salt: newSalt });
    } catch (err) {
      logger.error("Failed to update password on backend:", err);
      fail("Failed to save new password");
      return;
    }

    trackEvent("password_changed", { success: true });

    try {
      await savePassword(newPassword, user ? { userId: user.id, email: user.email } : undefined);
    } catch (err) {
      logger.error("Failed to save password locally:", err);
      // NOTE: The stored password no longer matches the keys, so drop it and require an unlock.
      await clearPassword().catch((clearError: unknown) => {
        logger.error("Failed to clear stale local password:", clearError);
      });
      setIsChanging(false);
      onLocalSaveFailed(
        "Password changed, but it couldn't be saved on this device. Unlock with your new password.",
      );
      return;
    }

    setIsChanging(false);
    onChanged();
  };

  const reset = useCallback(() => {
    setIsChanging(false);
    setError(null);
  }, []);

  return { changePassword, isChanging, error, reset };
}
