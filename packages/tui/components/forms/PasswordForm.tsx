import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { usePaste } from "../../hooks/usePaste";
import { useTextInput } from "../../hooks/useTextInput";
import { THEME_COLORS } from "../../utils/constants";
import {
  checkPasswordRequirements,
  getStrengthColor,
  type PasswordRequirement,
  passwordsMatch,
  validatePassword,
} from "../../utils/passwordValidator";
import { GuideBar } from "../shared/GuideBar";
import { InlineInput } from "./InlineInput";

interface PasswordFormProps {
  mode: "setup" | "change";
  onSubmit: (password: string) => void;
  onCancel?: () => void;
  currentPasswordRequired?: boolean;
  onCurrentPasswordVerify?: (password: string) => boolean;
  width?: number;
}

type FocusedField = "current" | "password" | "confirm";

export function PasswordForm({
  mode,
  onSubmit,
  onCancel,
  currentPasswordRequired = false,
  onCurrentPasswordVerify,
  width = 46,
}: PasswordFormProps) {
  const [focusedField, setFocusedField] = useState<FocusedField>(
    currentPasswordRequired ? "current" : "password",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

  const currentInput = useTextInput({ maxLength: 64 });
  const passwordInput = useTextInput({ maxLength: 64 });
  const confirmInput = useTextInput({ maxLength: 64 });

  const requirements = checkPasswordRequirements(passwordInput.value);
  const validation = validatePassword(passwordInput.value);
  const doPasswordsMatch = passwordsMatch(passwordInput.value, confirmInput.value);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => setError(null), []);
  useEffect(() => setCurrentPasswordError(null), []);

  const handlePaste = useCallback(
    (text: string) => {
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
    },
    [focusedField, currentInput, passwordInput, confirmInput],
  );

  usePaste(handlePaste);

  const handleSubmit = () => {
    const currentValidation = validatePassword(passwordInput.value);
    const currentPasswordsMatch = passwordsMatch(passwordInput.value, confirmInput.value);

    if (currentPasswordRequired && onCurrentPasswordVerify) {
      if (!onCurrentPasswordVerify(currentInput.value)) {
        setCurrentPasswordError("Incorrect");
        return;
      }
    }
    if (!currentValidation.isValid) {
      setError("Does not meet requirements");
      return;
    }
    if (!currentPasswordsMatch) {
      setError("Passwords do not match");
      return;
    }
    onSubmit(passwordInput.value);
  };

  const cycleFocus = (direction: "next" | "prev") => {
    const fields: FocusedField[] = currentPasswordRequired
      ? ["current", "password", "confirm"]
      : ["password", "confirm"];
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

  useKeyboard((key) => {
    if (key.name === "v" && key.ctrl) {
      setShowPassword((prev) => !prev);
      return;
    }
    if (key.name === "escape" && onCancel) {
      onCancel();
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
      focusedField === "current"
        ? currentInput
        : focusedField === "password"
          ? passwordInput
          : confirmInput;
    activeInput.handleKey(key);
  });

  const showHint = focusedField === "password";

  return (
    <box flexDirection="column" width={width} gap={1}>
      {currentPasswordRequired && (
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
          error={currentPasswordError}
          showIcon={false}
          showCount={false}
          width={width}
        />
      )}

      <InlineInput
        value={passwordInput.value}
        cursor={passwordInput.cursor}
        cursorVisible={cursorVisible}
        maxWidth={28}
        maxLength={64}
        placeholder={mode === "setup" ? "Password" : "New password"}
        isFocused={focusedField === "password"}
        isPassword={true}
        showPassword={showPassword}
        showIcon={false}
        showCount={false}
        width={width}
      />

      {showHint && (
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

      <InlineInput
        value={confirmInput.value}
        cursor={confirmInput.cursor}
        cursorVisible={cursorVisible}
        maxWidth={28}
        maxLength={64}
        placeholder="Confirm password"
        isFocused={focusedField === "confirm"}
        isPassword={true}
        showPassword={showPassword}
        error={confirmInput.value.length > 0 && !doPasswordsMatch ? "mismatch" : null}
        showIcon={false}
        showCount={false}
        width={width}
      />

      {error && (
        <box height={1} marginTop={1} paddingLeft={1}>
          <text fg={THEME_COLORS.error}>[!] {error}</text>
        </box>
      )}

      <box>
        <GuideBar
          groups={{
            primary: [
              {
                shortcuts: [
                  { key: "^v", description: showPassword ? "hide" : "show" },
                  { key: "tab", description: "next field" },
                  { key: "↵", description: mode === "setup" ? "continue" : "save" },
                ],
              },
            ],
            secondary: [],
          }}
          customWidth={width}
          minimal={true}
        />
      </box>
    </box>
  );
}
