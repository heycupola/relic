import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useSingleLineInput } from "../../hooks/useInput";
import { usePaste } from "../../hooks/usePaste";
import { THEME_COLORS } from "../../utils/constants";

interface TextInputProps {
  width?: number;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  focused?: boolean;
  isPassword?: boolean;
  showPassword?: boolean;
  initialValue?: string;
  active?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
}

function getDisplayText(
  value: string,
  cursor: number,
  maxWidth: number,
): { text: string; cursorPos: number } {
  if (value.length <= maxWidth) {
    return { text: value, cursorPos: cursor };
  }
  const padding = 5;
  let start = Math.max(0, Math.min(cursor - maxWidth + padding, value.length - maxWidth));
  if (cursor > maxWidth - padding) {
    start = Math.min(cursor - maxWidth + padding, value.length - maxWidth);
  }
  return { text: value.slice(start, start + maxWidth), cursorPos: cursor - start };
}

export function TextInput({
  width = 40,
  maxLength,
  label,
  placeholder,
  focused = true,
  isPassword = false,
  showPassword = false,
  initialValue = "",
  active = true,
  onChange,
  onSubmit,
  onCancel,
}: TextInputProps) {
  const input = useSingleLineInput({ maxLength: maxLength ?? 1000, initialValue, onSubmit });
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
    input.handlePaste(text);
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
  const { text: displayText, cursorPos: displayCursorPos } = getDisplayText(
    displayValue,
    input.cursor,
    width - 2,
  );

  const before = displayText.slice(0, displayCursorPos);
  const charAtCursor = displayText[displayCursorPos] || " ";
  const after = displayText.slice(displayCursorPos + 1);

  const bgColor = focused ? THEME_COLORS.inputBg : THEME_COLORS.inputBgInactive;
  const showCursor = cursorVisible && focused;
  const cursorBg = showCursor ? THEME_COLORS.primary : bgColor;
  const cursorFg = showCursor ? THEME_COLORS.header : THEME_COLORS.text;
  const isEmpty = input.value.length === 0;

  return (
    <box flexDirection="column">
      {label && (
        <box flexDirection="row" justifyContent="space-between" width={width}>
          <text fg={THEME_COLORS.textMuted}>{label}</text>
          {maxLength && (
            <text fg={THEME_COLORS.textDim}>
              {input.value.length}/{maxLength}
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
