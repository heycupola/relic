import { THEME_COLORS } from "../lib/constants";

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

/**
 * Reusable inline input display component.
 * Use with useInlineInput hook for keyboard handling.
 */
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

    // Calculate visible text with scrolling
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
                {/* Focus indicator */}
                <span fg={isFocused ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                    {isFocused ? "› " : "· "}
                </span>
                {/* Optional icon */}
                {showIcon && (
                    <>
                        <span fg={iconColor}>{icon}</span>
                        <span fg={THEME_COLORS.text}> </span>
                    </>
                )}
                {/* Input content */}
                {isEmpty ? (
                    <>
                        {showCursor ? (
                            <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}> </span>
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
            {/* Right side: error or count */}
            {error ? (
                <text fg={THEME_COLORS.error}>{error}</text>
            ) : showCount ? (
                <text fg={THEME_COLORS.textDim}>{charCount}</text>
            ) : null}
        </box>
    );
}

/**
 * Inline keyboard handler for single-line inputs.
 * Returns true if key was handled.
 */
export function handleInlineInputKey(
    key: { name: string; ctrl: boolean; meta: boolean; option: boolean; sequence: string },
    value: string,
    cursor: number,
    setValue: (v: string) => void,
    setCursor: (c: number) => void,
    maxLength: number = 30
): boolean {
    // Escape and Return are NOT handled here - parent should handle them

    // Arrow left with modifiers
    if (key.name === "left") {
        if (key.meta || key.option) {
            // Jump word backward
            let pos = cursor;
            while (pos > 0 && value[pos - 1] === " ") pos--;
            while (pos > 0 && value[pos - 1] !== " ") pos--;
            setCursor(pos);
        } else {
            setCursor(Math.max(0, cursor - 1));
        }
        return true;
    }

    // Arrow right with modifiers
    if (key.name === "right") {
        if (key.meta || key.option) {
            // Jump word forward
            let pos = cursor;
            while (pos < value.length && value[pos] !== " ") pos++;
            while (pos < value.length && value[pos] === " ") pos++;
            setCursor(pos);
        } else {
            setCursor(Math.min(value.length, cursor + 1));
        }
        return true;
    }

    // Ignore up/down arrows
    if (key.name === "up" || key.name === "down") {
        return true;
    }

    // Backspace with modifiers
    if (key.name === "backspace") {
        if (key.meta || key.option) {
            // Delete word backward
            if (cursor > 0) {
                let newPos = cursor;
                while (newPos > 0 && value[newPos - 1] === " ") newPos--;
                while (newPos > 0 && value[newPos - 1] !== " ") newPos--;
                setValue(value.slice(0, newPos) + value.slice(cursor));
                setCursor(newPos);
            }
        } else {
            // Delete one character
            if (cursor > 0) {
                setValue(value.slice(0, cursor - 1) + value.slice(cursor));
                setCursor(cursor - 1);
            }
        }
        return true;
    }

    // Delete key (forward delete)
    if (key.name === "delete") {
        if (cursor < value.length) {
            setValue(value.slice(0, cursor) + value.slice(cursor + 1));
        }
        return true;
    }

    // Ctrl+A: Jump to start
    if (key.name === "a" && key.ctrl) {
        setCursor(0);
        return true;
    }

    // Ctrl+E: Jump to end
    if (key.name === "e" && key.ctrl) {
        setCursor(value.length);
        return true;
    }

    // Ctrl+U: Delete all
    if (key.name === "u" && key.ctrl) {
        setValue("");
        setCursor(0);
        return true;
    }

    // Ctrl+W: Delete word backward
    if (key.name === "w" && key.ctrl) {
        if (cursor > 0) {
            let newPos = cursor;
            while (newPos > 0 && value[newPos - 1] === " ") newPos--;
            while (newPos > 0 && value[newPos - 1] !== " ") newPos--;
            setValue(value.slice(0, newPos) + value.slice(cursor));
            setCursor(newPos);
        }
        return true;
    }

    // Meta+B (Option+Left): Jump word backward
    if (key.name === "b" && key.meta) {
        let pos = cursor;
        while (pos > 0 && value[pos - 1] === " ") pos--;
        while (pos > 0 && value[pos - 1] !== " ") pos--;
        setCursor(pos);
        return true;
    }

    // Meta+F (Option+Right): Jump word forward
    if (key.name === "f" && key.meta) {
        let pos = cursor;
        while (pos < value.length && value[pos] !== " ") pos++;
        while (pos < value.length && value[pos] === " ") pos++;
        setCursor(pos);
        return true;
    }

    // Meta+D (Option+Delete): Delete word forward
    if (key.name === "d" && key.meta) {
        let endPos = cursor;
        while (endPos < value.length && value[endPos] === " ") endPos++;
        while (endPos < value.length && value[endPos] !== " ") endPos++;
        setValue(value.slice(0, cursor) + value.slice(endPos));
        return true;
    }

    // Regular typing
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta && !key.option) {
        if (value.length < maxLength) {
            setValue(value.slice(0, cursor) + key.sequence + value.slice(cursor));
            setCursor(cursor + 1);
        }
        return true;
    }

    // Ignore other modifier combinations
    if (key.meta || key.option || key.ctrl) {
        return true;
    }

    return false;
}
