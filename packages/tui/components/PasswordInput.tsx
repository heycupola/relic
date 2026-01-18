import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useSingleLineInput } from "../hooks/useInput";
import { usePaste } from "../hooks/usePaste";
import { KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";
import {
  checkPasswordRequirements,
  getStrengthColor,
  type PasswordRequirement,
  validatePassword,
} from "../utils/password";
import { InlineInput } from "./forms/InlineInput";
import { GuideBar } from "./shared/GuideBar";

interface PasswordInputProps {
  mode: "setup" | "change" | "unlock" | "verify";
  onSubmit: (password: string, newPassword?: string) => void;
  onCancel?: () => void;
  width?: number;
  disabled?: boolean;
  error?: string | null;
}

export function PasswordInput({
  mode,
  onSubmit,
  onCancel,
  width = 46,
  disabled = false,
  error = null,
}: PasswordInputProps) {
  const [focusedField, setFocusedField] = useState<"current" | "password" | "confirm">(
    mode === "change" ? "current" : "password",
  );
  const [showPassword, setShowPassword] = useState(false);

  const currentInput = useSingleLineInput({ maxLength: 64 });
  const passwordInput = useSingleLineInput({ maxLength: 64 });
  const confirmInput = useSingleLineInput({ maxLength: 64 });

  const requirements = checkPasswordRequirements(passwordInput.value);
  const validation = validatePassword(passwordInput.value);
  const passwordsMatch =
    confirmInput.value.length > 0 && confirmInput.value === passwordInput.value;
  const showStrength = mode !== "unlock" && focusedField === "password";

  const handlePaste = (text: string) => {
    const cleanText = text.replace(/\s/g, "");
    const activeInput =
      focusedField === "current"
        ? currentInput
        : focusedField === "password"
          ? passwordInput
          : confirmInput;
    const before = activeInput.value.slice(0, activeInput.cursor);
    const after = activeInput.value.slice(activeInput.cursor);
    const newValue = (before + cleanText + after).slice(0, 64);
    activeInput.setValue(newValue);
    activeInput.setCursor(Math.min(before.length + cleanText.length, 64));
  };

  usePaste(handlePaste);

  const cycleFocus = (direction: "next" | "prev") => {
    type FieldName = "current" | "password" | "confirm";
    const fields: readonly FieldName[] =
      mode === "change"
        ? ["current", "password", "confirm"]
        : mode === "unlock"
          ? ["password"]
          : ["password", "confirm"];
    const currentIndex = fields.indexOf(focusedField);
    const nextIndex =
      direction === "next"
        ? (currentIndex + 1) % fields.length
        : (currentIndex - 1 + fields.length) % fields.length;
    setFocusedField(fields[nextIndex] ?? "password");
  };

  const handleSubmit = () => {
    if (mode === "unlock" || mode === "verify") {
      if (passwordInput.value.length > 0) onSubmit(passwordInput.value);
      return;
    }

    if (mode === "change" && currentInput.value.length === 0) return;
    if (!validation.isValid) return;
    if (!passwordsMatch) return;

    if (mode === "change") {
      onSubmit(currentInput.value, passwordInput.value);
    } else {
      onSubmit(passwordInput.value);
    }
  };

  useKeyboard((key) => {
    if (disabled) return;
    if (key.name === "v" && key.ctrl) {
      setShowPassword((prev) => !prev);
      return;
    }
    if (key.name === "escape" && onCancel) {
      onCancel();
      return;
    }
    if (key.name === "tab" && mode !== "unlock") {
      cycleFocus(key.shift ? "prev" : "next");
      return;
    }
    if (key.name === "return") {
      handleSubmit();
      return;
    }
    if (key.sequence === " ") return;

    const activeInput =
      focusedField === "current"
        ? currentInput
        : focusedField === "password"
          ? passwordInput
          : confirmInput;
    activeInput.handleKey(key);
  });

  return (
    <box flexDirection="column" width={width} gap={1}>
      {mode === "change" && (
        <InlineInput
          active={focusedField === "current"}
          maxWidth={28}
          maxLength={64}
          placeholder="Current password"
          isFocused={focusedField === "current"}
          isPassword={true}
          showPassword={showPassword}
          showIcon={false}
          showCount={false}
          width={width}
        />
      )}

      <InlineInput
        active={mode === "unlock" || mode === "verify" || focusedField === "password"}
        maxWidth={28}
        maxLength={64}
        placeholder={
          mode === "unlock" ? "Password" : mode === "change" ? "New password" : "Password"
        }
        isFocused={focusedField === "password"}
        isPassword={true}
        showPassword={showPassword}
        error={error}
        showIcon={false}
        showCount={false}
        width={width}
      />

      {showStrength && (
        <box
          flexDirection="column"
          backgroundColor={THEME_COLORS.header}
          width={width}
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
                <span fg={req.met ? THEME_COLORS.text : THEME_COLORS.textMuted}> {req.label}</span>
              </text>
            </box>
          ))}
        </box>
      )}

      {mode !== "unlock" && mode !== "verify" && (
        <InlineInput
          active={focusedField === "confirm"}
          maxWidth={28}
          maxLength={64}
          placeholder="Confirm password"
          isFocused={focusedField === "confirm"}
          isPassword={true}
          showPassword={showPassword}
          error={confirmInput.value.length > 0 && !passwordsMatch ? "mismatch" : null}
          showIcon={false}
          showCount={false}
          width={width}
        />
      )}

      {error && mode === "unlock" && (
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
                ...(mode !== "unlock" && mode !== "verify"
                  ? [{ key: "tab", description: "next field", disabled }]
                  : []),
                {
                  key: KEY_SYMBOLS.enter,
                  description:
                    mode === "unlock" || mode === "verify"
                      ? "unlock"
                      : mode === "change"
                        ? "save"
                        : "continue",
                  disabled,
                },
              ],
            },
          ],
          secondary: [],
        }}
        customWidth={width}
        minimal={true}
      />
    </box>
  );
}
