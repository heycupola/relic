import { THEME_COLORS } from "../../utils/constants";
import { getDisplayTextWithCursor } from "../../utils/textInput";

interface TextInputProps {
  value: string;
  cursor: number;
  cursorVisible: boolean;
  width?: number;
  maxLength?: number;
  label?: string;
  placeholder?: string;
  focused?: boolean;
  isPassword?: boolean;
  showPassword?: boolean;
}

export function TextInput({
  value,
  cursor,
  cursorVisible,
  width = 40,
  maxLength,
  label,
  placeholder,
  focused = true,
  isPassword = false,
  showPassword = false,
}: TextInputProps) {
  // Mask password if needed
  const displayValue = isPassword && !showPassword ? "•".repeat(value.length) : value;

  const { displayText, displayCursorPos } = getDisplayTextWithCursor(
    displayValue,
    cursor,
    width - 2,
  );
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
