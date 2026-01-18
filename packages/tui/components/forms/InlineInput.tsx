import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useSingleLineInput } from "../../hooks/useInput";
import { usePaste } from "../../hooks/usePaste";
import { THEME_COLORS } from "../../utils/constants";

interface InlineInputProps {
  maxWidth?: number;
  maxLength?: number;
  icon?: string;
  iconColor?: string;
  placeholder?: string;
  isFocused?: boolean;
  isPassword?: boolean;
  showPassword?: boolean;
  error?: string | null;
  showIcon?: boolean;
  showCount?: boolean;
  width?: number;
  muted?: boolean;
  initialValue?: string;
  active?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
}

export function InlineInput({
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
  initialValue = "",
  active = true,
  onChange,
  onSubmit,
  onCancel,
}: InlineInputProps) {
  const input = useSingleLineInput({ maxLength, initialValue, onSubmit });
  const cursorVisible = useCursorBlink(active);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (active) submittedRef.current = false;
  }, [active]);

  useEffect(() => {
    onChange?.(input.value);
  }, [input.value, onChange]);

  usePaste((text) => {
    if (!active) return;
    const cleanText = text.replace(/\s/g, "").slice(0, maxLength);
    input.handlePaste(cleanText);
  });

  useKeyboard((key) => {
    if (!active) return;
    if (key.name === "escape") {
      onCancel?.();
      return;
    }
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

  const displayValue = isPassword && !showPassword ? "•".repeat(input.value.length) : input.value;
  const isEmpty = input.value.length === 0;
  const charCount = `${input.value.length}/${maxLength}`;
  const showCursor = isFocused && cursorVisible && !muted;
  const textColor = muted ? THEME_COLORS.textDim : THEME_COLORS.text;

  let displayText = displayValue;
  let displayCursor = input.cursor;
  let scrollLeft = "";
  let scrollRight = "";

  if (displayValue.length > maxWidth) {
    const padding = 3;
    let start = 0;
    if (input.cursor > maxWidth - padding) {
      start = Math.min(input.cursor - maxWidth + padding, displayValue.length - maxWidth);
    }
    start = Math.max(0, start);
    displayText = displayValue.slice(start, start + maxWidth);
    displayCursor = input.cursor - start;
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
