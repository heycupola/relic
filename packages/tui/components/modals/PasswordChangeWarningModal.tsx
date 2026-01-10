import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { usePaste } from "../../hooks/usePaste";
import { useTextInput } from "../../hooks/useTextInput";
import { KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
import { InlineInput } from "../forms/InlineInput";
import { GuideBar } from "../shared/GuideBar";
import { Modal } from "../shared/Modal";

interface PasswordChangeWarningModalProps {
  visible: boolean;
  onConfirm: (oldPassword: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function PasswordChangeWarningModal({
  visible,
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
}: PasswordChangeWarningModalProps) {
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useTextInput({ maxLength: 64 });

  // biome-ignore lint/correctness/useExhaustiveDependencies: passwordInput methods are stable
  useEffect(() => {
    if (visible) {
      passwordInput.setValue("");
      passwordInput.setCursor(0);
    }
  }, [visible]);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  const handlePaste = useCallback(
    (text: string) => {
      if (isLoading) return;
      const cleanText = text.replace(/\s/g, "");
      const before = passwordInput.value.slice(0, passwordInput.cursor);
      const after = passwordInput.value.slice(passwordInput.cursor);
      const newValue = (before + cleanText + after).slice(0, 64);
      passwordInput.setValue(newValue);
      passwordInput.setCursor(Math.min(before.length + cleanText.length, 64));
    },
    [isLoading, passwordInput],
  );

  usePaste(handlePaste);

  useKeyboard((key) => {
    if (!visible || isLoading) return;

    if (key.name === "v" && key.ctrl) {
      setShowPassword((prev) => !prev);
      return;
    }

    if (key.name === "return") {
      if (passwordInput.value.length > 0) {
        onConfirm(passwordInput.value);
      }
      return;
    }

    if (key.name === "escape") {
      onCancel();
      return;
    }

    if (key.sequence === " ") return;

    passwordInput.handleKey(key);
  });

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} title="Password Change Warning" width={60} height={12}>
      <box flexDirection="column" width={56} gap={1}>
        <box height={1}>
          <text fg={THEME_COLORS.accent}>[!] New password detected</text>
        </box>

        <box height={1}>
          <text fg={THEME_COLORS.text}>Enter your old password to rewrap your private key</text>
        </box>

        <box>
          <InlineInput
            value={passwordInput.value}
            cursor={passwordInput.cursor}
            cursorVisible={cursorVisible}
            maxWidth={28}
            maxLength={64}
            placeholder="Old password"
            isFocused={true}
            isPassword={true}
            showPassword={showPassword}
            showIcon={false}
            showCount={false}
            width={46}
          />
        </box>

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
                  { key: "^v", description: showPassword ? "hide" : "show" },
                  { key: KEY_SYMBOLS.enter, description: "confirm" },
                  { key: "esc", description: "cancel" },
                ],
              },
            ],
            secondary: [],
          }}
          customWidth={56}
          minimal={true}
        />
      </box>
    </Modal>
  );
}
