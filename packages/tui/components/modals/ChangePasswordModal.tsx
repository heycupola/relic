import { useKeyboard } from "@opentui/react";
import {
  decryptPrivateKeyWithPassword,
  encryptPrivateKeyWithPassword,
  generateSalt,
} from "@repo/crypto";
import { useCallback, useEffect, useState } from "react";
import { useUserKeys } from "../../convex/hooks/useUserKeys";
import { usePaste } from "../../hooks/usePaste";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { useTextInput } from "../../hooks/useTextInput";
import { KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
import { logger } from "../../utils/debugLog";
import {
  checkPasswordRequirements,
  getStrengthColor,
  type PasswordRequirement,
  validatePassword,
} from "../../utils/passwordValidator";
import { InlineInput } from "../forms/InlineInput";
import { GuideBar } from "../shared/GuideBar";
import { Modal } from "../shared/Modal";

type FocusedField = "current" | "new" | "confirm";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (newPassword: string) => void;
}

export function ChangePasswordModal({ visible, onClose, onSuccess }: ChangePasswordModalProps) {
  const { encryptedPrivateKey, salt, updatePassword } = useUserKeys();
  const { runTask, showSuccess } = useTaskQueue();

  const [focusedField, setFocusedField] = useState<FocusedField>("current");
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentInput = useTextInput({ maxLength: 64 });
  const newInput = useTextInput({ maxLength: 64 });
  const confirmInput = useTextInput({ maxLength: 64 });

  const requirements = checkPasswordRequirements(newInput.value);
  const validation = validatePassword(newInput.value);

  const resetState = () => {
    setFocusedField("current");
    setShowPassword(false);
    setIsProcessing(false);
    setError(null);
    currentInput.setValue("");
    currentInput.setCursor(0);
    newInput.setValue("");
    newInput.setCursor(0);
    confirmInput.setValue("");
    confirmInput.setCursor(0);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetState is intentionally excluded
  useEffect(() => {
    if (visible) {
      resetState();
    }
  }, [visible]);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  const handlePaste = useCallback(
    (text: string) => {
      if (isProcessing) return;
      const cleanText = text.replace(/\s/g, "");
      const activeInput =
        focusedField === "current"
          ? currentInput
          : focusedField === "new"
            ? newInput
            : confirmInput;
      const before = activeInput.value.slice(0, activeInput.cursor);
      const after = activeInput.value.slice(activeInput.cursor);
      const newValue = (before + cleanText + after).slice(0, 64);
      activeInput.setValue(newValue);
      activeInput.setCursor(Math.min(before.length + cleanText.length, 64));
    },
    [isProcessing, focusedField, currentInput, newInput, confirmInput],
  );

  usePaste(handlePaste);

  const cycleFocus = (direction: "next" | "prev") => {
    const fields: FocusedField[] = ["current", "new", "confirm"];
    const currentIndex = fields.indexOf(focusedField);
    const nextIndex =
      direction === "next"
        ? (currentIndex + 1) % fields.length
        : (currentIndex - 1 + fields.length) % fields.length;
    const targetField = fields[nextIndex];
    if (targetField) {
      setFocusedField(targetField);
    }
  };

  const handleSubmit = async () => {
    if (!encryptedPrivateKey || !salt) {
      setError("No encryption keys found");
      return;
    }

    if (!validation.isValid) {
      setError("New password does not meet requirements");
      return;
    }

    if (confirmInput.value !== newInput.value) {
      setError("Passwords do not match");
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      // Step 1: Verify current password
      let privateKey: CryptoKey;
      try {
        await runTask("Verifying current password...", async () => {
          privateKey = await decryptPrivateKeyWithPassword(
            encryptedPrivateKey,
            currentInput.value,
            salt,
          );
        });
      } catch (error) {
        logger.error("Failed to verify current password:", error);
        setIsProcessing(false);
        setError("Incorrect current password");
        return;
      }

      if (newInput.value === currentInput.value) {
        setIsProcessing(false);
        setError("Must be different from current password");
        return;
      }

      // Step 2: Rewrap key
      const newSalt = generateSalt();
      let newEncryptedPrivateKey: string;
      await runTask("Rewrapping your private key...", async () => {
        newEncryptedPrivateKey = await encryptPrivateKeyWithPassword(
          privateKey!,
          newInput.value,
          newSalt,
        );
      });

      // Step 3: Update backend
      await runTask("Updating password...", async () => {
        await updatePassword({
          encryptedPrivateKey: newEncryptedPrivateKey,
          salt: newSalt,
        });
      });

      setIsProcessing(false);
      showSuccess("Password updated successfully");
      onSuccess(newInput.value);
      onClose();
    } catch (error) {
      logger.error("Failed to change password:", error);
      setIsProcessing(false);
      setError("Failed to update password");
    }
  };

  useKeyboard((key) => {
    if (!visible || isProcessing) return;

    if (key.name === "v" && key.ctrl) {
      setShowPassword((prev) => !prev);
      return;
    }

    if (key.name === "escape") {
      onClose();
      return;
    }

    if (key.name === "tab") {
      cycleFocus(key.shift ? "prev" : "next");
      return;
    }

    if (key.name === "return") {
      handleSubmit();
      return;
    }

    if (key.sequence === " ") return;

    const activeInput =
      focusedField === "current" ? currentInput : focusedField === "new" ? newInput : confirmInput;
    activeInput.handleKey(key);
  });

  if (!visible) {
    return null;
  }

  const passwordsMatch = confirmInput.value.length > 0 && confirmInput.value === newInput.value;
  const showHint = focusedField === "new";

  return (
    <Modal visible={visible} title="Change Password" width={55} height={showHint ? 22 : 16}>
      <box flexDirection="column" width={51} gap={1}>
        <box height={1}>
          <text fg={THEME_COLORS.accent}>[!] Your private key will be rewrapped</text>
        </box>

        <InlineInput
          value={currentInput.value}
          cursor={currentInput.cursor}
          cursorVisible={cursorVisible}
          maxWidth={28}
          maxLength={64}
          placeholder="Current password"
          isFocused={focusedField === "current"}
          isPassword={true}
          showPassword={showPassword}
          showIcon={false}
          showCount={false}
          width={51}
        />

        <InlineInput
          value={newInput.value}
          cursor={newInput.cursor}
          cursorVisible={cursorVisible}
          maxWidth={28}
          maxLength={64}
          placeholder="New password"
          isFocused={focusedField === "new"}
          isPassword={true}
          showPassword={showPassword}
          showIcon={false}
          showCount={false}
          width={51}
        />

        {showHint && (
          <box
            flexDirection="column"
            backgroundColor={THEME_COLORS.header}
            width={51}
            paddingLeft={1}
            paddingRight={1}
          >
            <box height={1}>
              <text>
                <span fg={getStrengthColor(validation.strength)}>
                  {"●".repeat(validation.strengthScore)}
                  {"○".repeat(5 - validation.strengthScore)}
                </span>
                <span fg={THEME_COLORS.textMuted}> </span>
                <span fg={getStrengthColor(validation.strength)}>{validation.strength}</span>
              </text>
            </box>
            {requirements.map((req: PasswordRequirement) => (
              <box key={req.id} height={1}>
                <text>
                  <span fg={req.met ? THEME_COLORS.success : THEME_COLORS.textMuted}>
                    {req.met ? "✓" : "○"}
                  </span>
                  <span fg={req.met ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                    {" "}
                    {req.label}
                  </span>
                </text>
              </box>
            ))}
          </box>
        )}

        <InlineInput
          value={confirmInput.value}
          cursor={confirmInput.cursor}
          cursorVisible={cursorVisible}
          maxWidth={28}
          maxLength={64}
          placeholder="Confirm new password"
          isFocused={focusedField === "confirm"}
          isPassword={true}
          showPassword={showPassword}
          error={confirmInput.value.length > 0 && !passwordsMatch ? "mismatch" : null}
          showIcon={false}
          showCount={false}
          width={51}
        />

        {error && (
          <box height={1}>
            <text fg={THEME_COLORS.error}>[!] {error}</text>
          </box>
        )}

        <GuideBar
          groups={{
            primary: [
              {
                shortcuts: [
                  {
                    key: "^v",
                    description: showPassword ? "hide" : "show",
                    disabled: isProcessing,
                  },
                  { key: "tab", description: "next field", disabled: isProcessing },
                  { key: KEY_SYMBOLS.enter, description: "save", disabled: isProcessing },
                  { key: "esc", description: "cancel", disabled: isProcessing },
                ],
              },
            ],
            secondary: [],
          }}
          customWidth={51}
          minimal={true}
        />
      </box>
    </Modal>
  );
}
