import { THEME_COLORS } from "../../utils/constants";

interface InlineInputProps {
  value: string;
  cursor: number;
  cursorVisible: boolean;
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
}

export function InlineInput({
  value,
  cursor,
  cursorVisible,
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
}: InlineInputProps) {
  const displayValue = isPassword && !showPassword ? "•".repeat(value.length) : value;
  const isEmpty = value.length === 0;
  const charCount = `${value.length}/${maxLength}`;
  const showCursor = isFocused && cursorVisible;

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
            <span fg={THEME_COLORS.text}>{displayText.slice(0, displayCursor)}</span>
            {showCursor ? (
              <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                {displayText[displayCursor] || " "}
              </span>
            ) : (
              <span fg={THEME_COLORS.text}>{displayText[displayCursor] || " "}</span>
            )}
            <span fg={THEME_COLORS.text}>{displayText.slice(displayCursor + 1)}</span>
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
