import { useCallback, useState } from "react";

export interface InlineInputKey {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    option: boolean;
    sequence: string;
}

export interface UseInlineInputOptions {
    maxLength?: number;
    initialValue?: string;
}

export interface UseInlineInputReturn {
    value: string;
    cursor: number;
    setValue: (value: string) => void;
    setCursor: (cursor: number) => void;
    reset: () => void;
    handleKey: (key: InlineInputKey) => boolean;
    handlePaste: (text: string) => void;
    // Display helpers
    getDisplayText: (maxWidth: number) => { text: string; cursorPos: number; scrolled: boolean };
    charCount: string;
}

export function useInlineInput({
    maxLength = 30,
    initialValue = "",
}: UseInlineInputOptions = {}): UseInlineInputReturn {
    const [value, setValue] = useState(initialValue);
    const [cursor, setCursor] = useState(0);

    const reset = useCallback(() => {
        setValue(initialValue);
        setCursor(0);
    }, [initialValue]);

    const handlePaste = useCallback(
        (text: string) => {
            // Only paste what fits
            const availableSpace = maxLength - value.length;
            const textToInsert = text.slice(0, availableSpace);
            if (textToInsert.length === 0) return;

            const newValue = value.slice(0, cursor) + textToInsert + value.slice(cursor);
            setValue(newValue.slice(0, maxLength));
            setCursor(Math.min(cursor + textToInsert.length, maxLength));
        },
        [value, cursor, maxLength],
    );

    const handleKey = useCallback(
        (key: InlineInputKey): boolean => {
            // Escape - handled by parent
            if (key.name === "escape") {
                return false;
            }

            // Enter - handled by parent
            if (key.name === "return") {
                return false;
            }

            // Left arrow with modifiers
            if (key.name === "left") {
                if (key.meta) {
                    // Cmd+Left: Jump to start
                    setCursor(0);
                } else if (key.option) {
                    // Option+Left: Jump word backward
                    let pos = cursor;
                    while (pos > 0 && value[pos - 1] === " ") pos--;
                    while (pos > 0 && value[pos - 1] !== " ") pos--;
                    setCursor(pos);
                } else {
                    // Regular left
                    setCursor((prev) => Math.max(0, prev - 1));
                }
                return true;
            }

            // Right arrow with modifiers
            if (key.name === "right") {
                if (key.meta) {
                    // Cmd+Right: Jump to end
                    setCursor(value.length);
                } else if (key.option) {
                    // Option+Right: Jump word forward
                    let pos = cursor;
                    while (pos < value.length && value[pos] !== " ") pos++;
                    while (pos < value.length && value[pos] === " ") pos++;
                    setCursor(pos);
                } else {
                    // Regular right
                    setCursor((prev) => Math.min(value.length, prev + 1));
                }
                return true;
            }

            // Ignore up/down arrows
            if (key.name === "up" || key.name === "down") {
                return true;
            }

            // Backspace with modifiers
            if (key.name === "backspace") {
                if (key.meta) {
                    // Cmd+Backspace: Delete all to beginning
                    setValue(value.slice(cursor));
                    setCursor(0);
                } else if (key.option) {
                    // Option+Backspace: Delete word backward
                    if (cursor > 0) {
                        let newPos = cursor;
                        // Skip trailing spaces
                        while (newPos > 0 && value[newPos - 1] === " ") newPos--;
                        // Delete until we hit a space or reach the beginning
                        while (newPos > 0 && value[newPos - 1] !== " ") newPos--;
                        setValue(value.slice(0, newPos) + value.slice(cursor));
                        setCursor(newPos);
                    }
                } else {
                    // Regular backspace: Delete one character
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

            // Regular typing
            if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta && !key.option) {
                if (value.length < maxLength) {
                    setValue(value.slice(0, cursor) + key.sequence + value.slice(cursor));
                    setCursor(cursor + 1);
                }
                return true;
            }

            // Ignore unhandled modifier combinations
            if (key.meta || key.option || key.ctrl) {
                return true;
            }

            return false;
        },
        [value, cursor, maxLength],
    );

    // Display text with scrolling if needed
    const getDisplayText = useCallback(
        (maxWidth: number): { text: string; cursorPos: number; scrolled: boolean } => {
            if (value.length <= maxWidth) {
                return { text: value, cursorPos: cursor, scrolled: false };
            }

            // If cursor is near the end, scroll to show end
            // If cursor is near the start, show start
            // Otherwise center on cursor
            const padding = 5;
            let start = 0;

            if (cursor > maxWidth - padding) {
                // Cursor near end, scroll to keep cursor visible
                start = Math.min(cursor - maxWidth + padding, value.length - maxWidth);
            }

            start = Math.max(0, start);
            const text = value.slice(start, start + maxWidth);
            const cursorPos = cursor - start;

            return { text, cursorPos, scrolled: start > 0 };
        },
        [value, cursor],
    );

    const charCount = `${value.length}/${maxLength}`;

    return {
        value,
        cursor,
        setValue,
        setCursor,
        reset,
        handleKey,
        handlePaste,
        getDisplayText,
        charCount,
    };
}
