import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { usePaste } from "../../hooks/usePaste";
import { useTextInput } from "../../hooks/useTextInput";
import { KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
import { GuideBar } from "../shared/GuideBar";
import { InlineInput } from "./InlineInput";

interface SinglePasswordInputProps {
  onSubmit: (password: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  error?: string | null;
  placeholder?: string;
}

export function SinglePasswordInput({
  onSubmit,
  onCancel,
  disabled = false,
  error = null,
  placeholder = "Password",
}: SinglePasswordInputProps) {
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useTextInput({ maxLength: 64 });

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  const handlePaste = useCallback(
    (text: string) => {
      if (disabled) return;
      const cleanText = text.replace(/\s/g, "");
      const before = passwordInput.value.slice(0, passwordInput.cursor);
      const after = passwordInput.value.slice(passwordInput.cursor);
      const newValue = (before + cleanText + after).slice(0, 64);
      passwordInput.setValue(newValue);
      passwordInput.setCursor(Math.min(before.length + cleanText.length, 64));
    },
    [disabled, passwordInput],
  );

  usePaste(handlePaste);

  useKeyboard((key) => {
    if (disabled) return;

    if (key.name === "v" && key.ctrl) {
      setShowPassword((prev) => !prev);
      return;
    }

    if (key.name === "escape") {
      onCancel();
      return;
    }

    if (key.name === "return") {
      if (passwordInput.value.length > 0) {
        onSubmit(passwordInput.value);
      }
      return;
    }

    if (key.sequence === " ") return;

    passwordInput.handleKey(key);
  });

  return (
    <box flexDirection="column" gap={1}>
      <InlineInput
        value={passwordInput.value}
        cursor={passwordInput.cursor}
        cursorVisible={cursorVisible}
        maxWidth={28}
        maxLength={64}
        placeholder={placeholder}
        isFocused={true}
        isPassword={true}
        showPassword={showPassword}
        showIcon={false}
        showCount={false}
        width={46}
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
                { key: "^v", description: showPassword ? "hide" : "show", disabled },
                { key: KEY_SYMBOLS.enter, description: "confirm", disabled },
                { key: "esc", description: "cancel", disabled },
              ],
            },
          ],
          secondary: [],
        }}
        customWidth={46}
        minimal={true}
      />
    </box>
  );
}
