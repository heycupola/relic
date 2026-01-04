import { useCallback, useRef, useState } from "react";
import type { Key } from "../types";
import { moveWordBackward, moveWordForward } from "../utils/textInput";

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
  handleKey: (key: Key) => boolean;
  handlePaste: (text: string) => void;
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

  // Use a ref to track pending state for atomic paste operations
  const stateRef = useRef({ value, cursor });
  stateRef.current = { value, cursor };

  const handlePaste = useCallback(
    (text: string) => {
      // Always read from stateRef to get the absolute latest values
      const current = stateRef.current;
      const availableSpace = maxLength - current.value.length;
      const textToInsert = text.slice(0, availableSpace);
      if (textToInsert.length === 0) return;

      const newValue =
        current.value.slice(0, current.cursor) + textToInsert + current.value.slice(current.cursor);
      const newCursor = Math.min(current.cursor + textToInsert.length, maxLength);
      setValue(newValue.slice(0, maxLength));
      setCursor(newCursor);
      // Update ref immediately for next paste in same event loop
      stateRef.current = { value: newValue.slice(0, maxLength), cursor: newCursor };
    },
    [maxLength],
  );

  const handleKey = useCallback(
    (key: Key): boolean => {
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
          setCursor(0);
        } else if (key.option) {
          setCursor(moveWordBackward(value, cursor));
        } else {
          setCursor((prev) => Math.max(0, prev - 1));
        }
        return true;
      }

      // Right arrow with modifiers
      if (key.name === "right") {
        if (key.meta) {
          setCursor(value.length);
        } else if (key.option) {
          setCursor(moveWordForward(value, cursor));
        } else {
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
        // Option+Backspace (key.meta in terminal): Delete word backward
        if (key.meta || key.option) {
          if (cursor > 0) {
            const newPos = moveWordBackward(value, cursor);
            setValue(value.slice(0, newPos) + value.slice(cursor));
            setCursor(newPos);
          }
        } else {
          if (cursor > 0) {
            setValue(value.slice(0, cursor - 1) + value.slice(cursor));
            setCursor(cursor - 1);
          }
        }
        return true;
      }

      // Delete key
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
          const newPos = moveWordBackward(value, cursor);
          setValue(value.slice(0, newPos) + value.slice(cursor));
          setCursor(newPos);
        }
        return true;
      }

      // Regular typing - also handles Cmd+V paste (multi-character sequence)
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        // For multi-character sequences (paste), insert as much as possible
        const availableSpace = maxLength - value.length;
        const textToInsert = key.sequence.slice(0, availableSpace);
        if (textToInsert.length > 0) {
          setValue(value.slice(0, cursor) + textToInsert + value.slice(cursor));
          setCursor(cursor + textToInsert.length);
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

  const getDisplayText = useCallback(
    (maxWidth: number): { text: string; cursorPos: number; scrolled: boolean } => {
      if (value.length <= maxWidth) {
        return { text: value, cursorPos: cursor, scrolled: false };
      }

      const padding = 5;
      let start = 0;

      if (cursor > maxWidth - padding) {
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
