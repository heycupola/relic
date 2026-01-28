import { useKeyboard } from "@opentui/react";
import {
  checkPasswordRequirements,
  getStrengthColor,
  type PasswordRequirement,
  validatePassword,
} from "@repo/auth";
import { useEffect, useState } from "react";
import { KEY_SYMBOLS, THEME_COLORS } from "../utils/constants";
import { InlineInput } from "./forms/InlineInput";
import { GuideBar } from "./shared/GuideBar";

interface Shortcut {
  key: string;
  description: string;
  disabled?: boolean;
}

interface PasswordInputProps {
  mode: "setup" | "change" | "unlock" | "verify";
  onSubmit: (password: string, newPassword?: string) => void;
  onCancel?: () => void;
  width?: number;
  disabled?: boolean;
  error?: string | null;
  additionalShortcuts?: Shortcut[];
}

export function PasswordInput({
  mode,
  onSubmit,
  onCancel,
  width = 46,
  disabled = false,
  error = null,
  additionalShortcuts = [],
}: PasswordInputProps) {
  const [focusedField, setFocusedField] = useState<"current" | "password" | "confirm">(
    mode === "change" ? "current" : "password",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [currentValue, setCurrentValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const requirements = checkPasswordRequirements(passwordValue);
  const validation = validatePassword(passwordValue);
  const passwordsMatch = confirmValue.length > 0 && confirmValue === passwordValue;
  const showStrength = mode !== "unlock" && mode !== "verify" && focusedField === "password";

  // Clear validation errors when password becomes valid
  useEffect(() => {
    if (showValidationErrors && validation.isValid) {
      setShowValidationErrors(false);
    }
  }, [showValidationErrors, validation.isValid]);

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
      if (passwordValue.length > 0) onSubmit(passwordValue);
      return;
    }

    if (mode === "change" && currentValue.length === 0) return;
    if (!validation.isValid) {
      setShowValidationErrors(true);
      return;
    }
    if (!passwordsMatch) return;

    if (mode === "change") {
      onSubmit(currentValue, passwordValue);
    } else {
      onSubmit(passwordValue);
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
          onChange={setCurrentValue}
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
        onChange={setPasswordValue}
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
          error={confirmValue.length > 0 && !passwordsMatch ? "mismatch" : null}
          showIcon={false}
          showCount={false}
          width={width}
          onChange={setConfirmValue}
        />
      )}

      {showValidationErrors && validation.errors.length > 0 && (
        <box flexDirection="column">
          <box height={1}>
            <text fg={THEME_COLORS.error}>[!] Password requirements not met:</text>
          </box>
          {validation.errors.map((err) => (
            <box key={err} height={1} paddingLeft={4}>
              <text fg={THEME_COLORS.error}>• {err}</text>
            </box>
          ))}
        </box>
      )}

      <GuideBar
        groups={{
          primary: [
            {
              shortcuts: [
                ...(mode !== "unlock" && mode !== "verify"
                  ? [{ key: "tab", description: "next field", disabled }]
                  : []),
                { key: "^v", description: showPassword ? "hide" : "show", disabled },
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
                ...additionalShortcuts,
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
