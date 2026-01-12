import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useInlineInput } from "../../hooks/useInlineInput";
import { usePaste } from "../../hooks/usePaste";
import { THEME_COLORS } from "../../utils/constants";

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
  /** Maximum visible width before scrolling */
  maxWidth?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Icon to show before input */
  icon?: string;
  /** Color for the icon */
  iconColor?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Whether this input has focus (affects styling) */
  isFocused?: boolean;
  /** Whether to mask input as password */
  isPassword?: boolean;
  /** Whether to show password (only relevant if isPassword) */
  showPassword?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Whether to show the icon */
  showIcon?: boolean;
  /** Whether to show character count */
  showCount?: boolean;
  /** Total width of the component */
  width?: number;
  /** Whether to show input in muted/disabled state */
  muted?: boolean;
}

type InlineInputProps = CommonProps & (ControlledProps | UncontrolledProps);

/**
 * Determines if props are for controlled mode
 */
function isControlled(props: InlineInputProps): props is CommonProps & ControlledProps {
  return "value" in props && props.value !== undefined;
}

/**
 * InlineInput - A smart inline text input component for TUI
 *
 * Supports two modes:
 * 1. **Controlled mode**: Pass `value`, `cursor`, `cursorVisible` - parent manages state
 * 2. **Uncontrolled/Smart mode**: Pass `onSubmit`, `onCancel`, `onChange` - component manages state
 *
 * Smart mode features:
 * - Full keyboard navigation (arrows, word jumping with Option/Meta)
 * - Backspace/Delete with modifiers
 * - Ctrl+A/E/U/W shortcuts
 * - Paste support
 * - Cursor blinking
 *
 * @example
 * // Smart mode (recommended)
 * <InlineInput
 *   active={isEditing}
 *   onSubmit={(value) => createProject(value)}
 *   onCancel={() => setIsEditing(false)}
 *   placeholder="e.g. my-project"
 * />
 *
 * @example
 * // Controlled mode (legacy)
 * <InlineInput
 *   value={inputValue}
 *   cursor={cursorPos}
 *   cursorVisible={showCursor}
 * />
 */
export function InlineInput(props: InlineInputProps) {
  const {
    maxWidth = 30,
    maxLength = 30,
    icon = "[+]",
    iconColor = THEME_COLORS.success,
    placeholder,
    isFocused = true,
    isPassword = false,
    showPassword = false,
    error,
    showIcon = true,
    showCount = true,
    width,
    muted = false,
  } = props;

  if (!isControlled(props)) {
    return (
      <SmartInlineInput
        {...props}
        maxWidth={maxWidth}
        maxLength={maxLength}
        icon={icon}
        iconColor={iconColor}
        placeholder={placeholder}
        isFocused={isFocused}
        isPassword={isPassword}
        showPassword={showPassword}
        error={error}
        showIcon={showIcon}
        showCount={showCount}
        width={width}
        muted={muted}
      />
    );
  }

  const { value, cursor, cursorVisible } = props;

  return (
    <InlineInputDisplay
      value={value}
      cursor={cursor}
      cursorVisible={cursorVisible}
      maxWidth={maxWidth}
      maxLength={maxLength}
      icon={icon}
      iconColor={iconColor}
      placeholder={placeholder}
      isFocused={isFocused}
      isPassword={isPassword}
      showPassword={showPassword}
      error={error}
      showIcon={showIcon}
      showCount={showCount}
      width={width}
      muted={muted}
    />
  );
}

/**
 * Smart mode implementation - handles its own state and keyboard
 */
function SmartInlineInput({
  initialValue = "",
  active = true,
  onChange,
  onSubmit,
  onCancel,
  maxWidth,
  maxLength,
  icon,
  iconColor,
  placeholder,
  isFocused,
  isPassword,
  showPassword,
  error,
  showIcon,
  showCount,
  width,
  muted,
}: CommonProps & UncontrolledProps) {
  const input = useInlineInput({ maxLength, initialValue });
  const cursorVisible = useCursorBlink(active);

  const submittedRef = useRef(false);

  useEffect(() => {
    if (active) {
      submittedRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    onChange?.(input.value);
  }, [input.value, onChange]);

  usePaste((text) => {
    if (!active) return;
    const cleanText = text.replace(/\s/g, "").slice(0, maxLength);
    input.handlePaste(cleanText);
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

    input.handleKey(key);
  });

  return (
    <InlineInputDisplay
      value={input.value}
      cursor={input.cursor}
      cursorVisible={cursorVisible}
      maxWidth={maxWidth!}
      maxLength={maxLength!}
      icon={icon!}
      iconColor={iconColor!}
      placeholder={placeholder}
      isFocused={isFocused!}
      isPassword={isPassword!}
      showPassword={showPassword!}
      error={error}
      showIcon={showIcon!}
      showCount={showCount!}
      width={width}
      muted={muted}
    />
  );
}

/**
 * Pure display component - no state, no keyboard handling
 */
interface InlineInputDisplayProps {
  value: string;
  cursor: number;
  cursorVisible: boolean;
  maxWidth: number;
  maxLength: number;
  icon: string;
  iconColor: string;
  placeholder?: string;
  isFocused: boolean;
  isPassword: boolean;
  showPassword: boolean;
  error?: string | null;
  showIcon: boolean;
  showCount: boolean;
  width?: number;
  muted?: boolean;
}

function InlineInputDisplay({
  value,
  cursor,
  cursorVisible,
  maxWidth,
  maxLength,
  icon,
  iconColor,
  placeholder,
  isFocused,
  isPassword,
  showPassword,
  error,
  showIcon,
  showCount,
  width,
  muted,
}: InlineInputDisplayProps) {
  const displayValue = isPassword && !showPassword ? "•".repeat(value.length) : value;
  const isEmpty = value.length === 0;
  const charCount = `${value.length}/${maxLength}`;
  const showCursor = isFocused && cursorVisible && !muted;
  const textColor = muted ? THEME_COLORS.textDim : THEME_COLORS.text;

  let displayText = displayValue;
  let displayCursor = cursor;
  let scrollLeft = "";
  let scrollRight = "";

  if (displayValue.length > maxWidth) {
    const padding = 3;
    let start = 0;
    if (cursor > maxWidth - padding) {
      start = Math.min(cursor - maxWidth + padding, displayValue.length - maxWidth);
    }
    start = Math.max(0, start);
    displayText = displayValue.slice(start, start + maxWidth);
    displayCursor = cursor - start;
    if (start > 0) scrollLeft = "◀ ";
    if (start + maxWidth < displayValue.length) scrollRight = " ▶";
  }

  return (
    <box height={1} width={width} flexDirection="row" justifyContent="space-between">
      <text>
        <span fg={isFocused ? THEME_COLORS.primary : THEME_COLORS.textDim}>
          {isFocused ? "› " : "· "}
        </span>
        {showIcon && (
          <>
            <span fg={iconColor}>{icon}</span>
            <span fg={THEME_COLORS.text}> </span>
          </>
        )}
        {isEmpty ? (
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
            <span fg={THEME_COLORS.textDim}>{scrollLeft}</span>
            <span fg={textColor}>{displayText.slice(0, displayCursor)}</span>
            {showCursor ? (
              <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                {displayText[displayCursor] || " "}
              </span>
            ) : (
              <span fg={textColor}>{displayText[displayCursor] || " "}</span>
            )}
            <span fg={textColor}>{displayText.slice(displayCursor + 1)}</span>
            <span fg={THEME_COLORS.textDim}>{scrollRight}</span>
          </>
        )}
      </text>
      {error ? (
        <text fg={THEME_COLORS.error}>{error}</text>
      ) : showCount ? (
        <text fg={THEME_COLORS.textDim}>{charCount}</text>
      ) : null}
    </box>
  );
}
