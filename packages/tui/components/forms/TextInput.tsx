import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { usePaste } from "../../hooks/usePaste";
import { useTextInput } from "../../hooks/useTextInput";
import { THEME_COLORS } from "../../utils/constants";
import { getDisplayTextWithCursor } from "../../utils/textInput";

/**
 * Props for controlled mode - parent manages state
 */
interface ControlledProps {
  /** Current input value (controlled) */
  value: string;
  /** Current cursor position (controlled) */
  cursor: number;
  /** Whether cursor is visible (controlled) */
  cursorVisible: boolean;
  /** Called when value changes */
  onChange?: never;
  /** Called when Enter is pressed */
  onSubmit?: never;
  /** Called when Escape is pressed */
  onCancel?: never;
  /** Initial value for uncontrolled mode */
  initialValue?: never;
  /** Whether this input is active and should handle keyboard */
  active?: never;
}

/**
 * Props for uncontrolled/smart mode - component manages own state
 */
interface UncontrolledProps {
  /** Current input value (controlled) */
  value?: never;
  /** Current cursor position (controlled) */
  cursor?: never;
  /** Whether cursor is visible (controlled) */
  cursorVisible?: never;
  /** Called when value changes */
  onChange?: (value: string) => void;
  /** Called when Enter is pressed with trimmed value */
  onSubmit?: (value: string) => void;
  /** Called when Escape is pressed */
  onCancel?: () => void;
  /** Initial value for uncontrolled mode */
  initialValue?: string;
  /** Whether this input is active and should handle keyboard (default: true) */
  active?: boolean;
}

/**
 * Common props for both modes
 */
interface CommonProps {
  /** Width of the input box */
  width?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Label shown above the input */
  label?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether this input has focus (affects styling) */
  focused?: boolean;
  /** Whether to mask input as password */
  isPassword?: boolean;
  /** Whether to show password (only relevant if isPassword) */
  showPassword?: boolean;
}

type TextInputProps = CommonProps & (ControlledProps | UncontrolledProps);

/**
 * Determines if props are for controlled mode
 */
function isControlled(props: TextInputProps): props is CommonProps & ControlledProps {
  return "value" in props && props.value !== undefined;
}

/**
 * TextInput - A smart box-style text input component for TUI
 *
 * Supports two modes:
 * 1. **Controlled mode**: Pass `value`, `cursor`, `cursorVisible` - parent manages state
 * 2. **Uncontrolled/Smart mode**: Pass `onSubmit`, `onCancel`, `onChange` - component manages state
 *
 * @example
 * // Smart mode (recommended)
 * <TextInput
 *   active={isFocused}
 *   onSubmit={(value) => handleSubmit(value)}
 *   label="Username"
 *   placeholder="Enter username"
 * />
 *
 * @example
 * // Controlled mode (legacy)
 * <TextInput
 *   value={inputValue}
 *   cursor={cursorPos}
 *   cursorVisible={showCursor}
 *   focused={isFocused}
 * />
 */
export function TextInput(props: TextInputProps) {
  const {
    width = 40,
    maxLength,
    label,
    placeholder,
    focused = true,
    isPassword = false,
    showPassword = false,
  } = props;

  // Smart/uncontrolled mode
  if (!isControlled(props)) {
    return (
      <SmartTextInput
        {...props}
        width={width}
        maxLength={maxLength}
        label={label}
        placeholder={placeholder}
        focused={focused}
        isPassword={isPassword}
        showPassword={showPassword}
      />
    );
  }

  // Controlled mode - just render
  const { value, cursor, cursorVisible } = props;

  return (
    <TextInputDisplay
      value={value}
      cursor={cursor}
      cursorVisible={cursorVisible}
      width={width}
      maxLength={maxLength}
      label={label}
      placeholder={placeholder}
      focused={focused}
      isPassword={isPassword}
      showPassword={showPassword}
    />
  );
}

/**
 * Smart mode implementation - handles its own state and keyboard
 */
function SmartTextInput({
  initialValue = "",
  active = true,
  onChange,
  onSubmit,
  onCancel,
  width,
  maxLength,
  label,
  placeholder,
  focused,
  isPassword,
  showPassword,
}: CommonProps & UncontrolledProps) {
  const input = useTextInput({ maxLength: maxLength ?? 1000, initialValue });
  const cursorVisible = useCursorBlink(active);

  // Track if we've already submitted to prevent double-submit
  const submittedRef = useRef(false);

  // Reset submitted flag when becoming active again
  useEffect(() => {
    if (active) {
      submittedRef.current = false;
    }
  }, [active]);

  // Notify parent of value changes
  useEffect(() => {
    onChange?.(input.value);
  }, [input.value, onChange]);

  // Handle paste
  usePaste((text) => {
    if (!active) return;
    input.handlePaste(text);
  });

  // Handle keyboard
  useKeyboard((key) => {
    if (!active) return;

    // Escape - cancel
    if (key.name === "escape") {
      onCancel?.();
      return;
    }

    // Enter - submit
    if (key.name === "return") {
      if (submittedRef.current) return;
      const trimmed = input.value.trim();
      if (trimmed && onSubmit) {
        submittedRef.current = true;
        onSubmit(trimmed);
      }
      return;
    }

    // Delegate to input hook
    input.handleKey(key);
  });

  return (
    <TextInputDisplay
      value={input.value}
      cursor={input.cursor}
      cursorVisible={cursorVisible}
      width={width!}
      maxLength={maxLength}
      label={label}
      placeholder={placeholder}
      focused={focused!}
      isPassword={isPassword!}
      showPassword={showPassword!}
    />
  );
}

/**
 * Pure display component - no state, no keyboard handling
 */
interface TextInputDisplayProps {
  value: string;
  cursor: number;
  cursorVisible: boolean;
  width: number;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  focused: boolean;
  isPassword: boolean;
  showPassword: boolean;
}

function TextInputDisplay({
  value,
  cursor,
  cursorVisible,
  width,
  maxLength,
  label,
  placeholder,
  focused,
  isPassword,
  showPassword,
}: TextInputDisplayProps) {
  // Mask password if needed
  const displayValue = isPassword && !showPassword ? "•".repeat(value.length) : value;

  const { displayText, displayCursorPos } = getDisplayTextWithCursor(displayValue, cursor, width - 2);
  const before = displayText.slice(0, displayCursorPos);
  const charAtCursor = displayText[displayCursorPos] || " ";
  const after = displayText.slice(displayCursorPos + 1);

  const bgColor = focused ? THEME_COLORS.inputBg : THEME_COLORS.inputBgInactive;
  const showCursor = cursorVisible && focused;
  const cursorBg = showCursor ? THEME_COLORS.primary : bgColor;
  const cursorFg = showCursor ? THEME_COLORS.header : THEME_COLORS.text;

  const isEmpty = value.length === 0;

  return (
    <box flexDirection="column">
      {label && (
        <box flexDirection="row" justifyContent="space-between" width={width}>
          <text fg={THEME_COLORS.textMuted}>{label}</text>
          {maxLength && (
            <text fg={THEME_COLORS.textDim}>
              {value.length}/{maxLength}
            </text>
          )}
        </box>
      )}
      <box height={1} width={width} backgroundColor={bgColor} paddingLeft={1}>
        <text>
          {isEmpty && !focused && placeholder ? (
            <span fg={THEME_COLORS.textDim}>{placeholder}</span>
          ) : isEmpty && focused ? (
            <>
              {showCursor ? (
                <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                  {" "}
                </span>
              ) : (
                <span> </span>
              )}
              {placeholder && <span fg={THEME_COLORS.textDim}>{placeholder}</span>}
            </>
          ) : (
            <>
              <span fg={THEME_COLORS.text}>{before}</span>
              <span bg={cursorBg} fg={cursorFg}>
                {charAtCursor}
              </span>
              <span fg={THEME_COLORS.text}>{after}</span>
            </>
          )}
        </text>
      </box>
    </box>
  );
}
