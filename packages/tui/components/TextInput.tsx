import { THEME_COLORS } from "../lib/constants";
import { getDisplayTextWithCursor } from "../lib/textInput";

interface TextInputProps {
  value: string;
  cursor: number;
  cursorVisible: boolean;
  width?: number;
  maxLength?: number;
  label?: string;
  focused?: boolean;
}

export function TextInput({
  value,
  cursor,
  cursorVisible,
  width = 40,
  maxLength,
  label,
  focused = true,
}: TextInputProps) {
  const { displayText, displayCursorPos } = getDisplayTextWithCursor(value, cursor, width - 2);
  const before = displayText.slice(0, displayCursorPos);
  const charAtCursor = displayText[displayCursorPos] || " ";
  const after = displayText.slice(displayCursorPos + 1);

  const bgColor = focused ? THEME_COLORS.inputBg : THEME_COLORS.inputBgInactive;
  const showCursor = cursorVisible && focused;
  const cursorBg = showCursor ? THEME_COLORS.primary : bgColor;
  const cursorFg = showCursor ? THEME_COLORS.header : THEME_COLORS.text;

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
        <text fg={THEME_COLORS.text}>
          {before}
          <span bg={cursorBg} fg={cursorFg}>
            {charAtCursor}
          </span>
          {after}
        </text>
      </box>
    </box>
  );
}
