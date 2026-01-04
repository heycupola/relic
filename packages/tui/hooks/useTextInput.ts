import { useCallback, useRef, useState } from "react";
import type { Key } from "../types";
import {
  deleteCharAtCursor,
  deleteWordBackward,
  insertTextAtCursor,
  moveWordBackward,
  moveWordForward,
} from "../utils/textInput";

export interface UseTextInputOptions {
  initialValue?: string;
  maxLength?: number;
  onSubmit?: (value: string) => void;
}

export interface UseTextInputReturn {
  value: string;
  cursor: number;
  setValue: (value: string) => void;
  setCursor: (cursor: number) => void;
  reset: () => void;
  handleKey: (key: Key) => boolean;
  handlePaste: (text: string) => void;
}

export function useTextInput({
  initialValue = "",
  maxLength = 1000,
  onSubmit,
}: UseTextInputOptions = {}): UseTextInputReturn {
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
      // This handles rapid consecutive pastes correctly
      const current = stateRef.current;
      const result = insertTextAtCursor(current.value, current.cursor, text, maxLength);
      setValue(result.text);
      setCursor(result.cursor);
      // Update ref immediately so next paste in same event loop has correct values
      stateRef.current = { value: result.text, cursor: result.cursor };
    },
    [maxLength],
  );

  const handleKey = useCallback(
    (key: Key): boolean => {
      if (key.name === "return" && onSubmit) {
        onSubmit(value);
        return true;
      }

      if (key.name === "a" && key.ctrl) {
        setCursor(0);
        return true;
      }

      if (key.name === "e" && key.ctrl) {
        setCursor(value.length);
        return true;
      }

      if (key.name === "left" && key.option) {
        setCursor(moveWordBackward(value, cursor));
        return true;
      }

      if (key.name === "right" && key.option) {
        setCursor(moveWordForward(value, cursor));
        return true;
      }

      if (key.name === "left" && key.meta) {
        setCursor(0);
        return true;
      }

      if (key.name === "right" && key.meta) {
        setCursor(value.length);
        return true;
      }

      if (key.name === "left") {
        setCursor((prev) => Math.max(0, prev - 1));
        return true;
      }

      if (key.name === "right") {
        setCursor((prev) => Math.min(value.length, prev + 1));
        return true;
      }

      if (key.name === "u" && key.ctrl) {
        setValue("");
        setCursor(0);
        return true;
      }

      // Option+Backspace (key.meta in terminal): Delete word backward
      if (key.name === "backspace" && (key.meta || key.option)) {
        const result = deleteWordBackward(value, cursor);
        setValue(result.text);
        setCursor(result.cursor);
        return true;
      }

      if (key.name === "backspace") {
        const result = deleteCharAtCursor(value, cursor);
        setValue(result.text);
        setCursor(result.cursor);
        return true;
      }

      if (key.name === "escape") {
        return false;
      }

      const ignoredKeys = [
        "up",
        "down",
        "pageup",
        "pagedown",
        "home",
        "end",
        "insert",
        "delete",
        "f1",
        "f2",
        "f3",
        "f4",
        "f5",
        "f6",
        "f7",
        "f8",
        "f9",
        "f10",
        "f11",
        "f12",
      ];
      if (ignoredKeys.includes(key.name)) {
        return false;
      }

      // Regular typing - also handles Cmd+V paste (multi-character sequence)
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const result = insertTextAtCursor(value, cursor, key.sequence, maxLength);
        setValue(result.text);
        setCursor(result.cursor);
        return true;
      }

      return false;
    },
    [value, cursor, maxLength, onSubmit],
  );

  return {
    value,
    cursor,
    setValue,
    setCursor,
    reset,
    handleKey,
    handlePaste,
  };
}
