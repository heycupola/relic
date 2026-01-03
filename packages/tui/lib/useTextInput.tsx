export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  option: boolean;
  shift: boolean;
  sequence: string;
}

import { useCallback, useState } from "react";
import { deleteCharAtCursor, deleteWordBackward, insertTextAtCursor } from "./textInput";

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

  const handlePaste = useCallback(
    (text: string) => {
      const result = insertTextAtCursor(value, cursor, text, maxLength);
      setValue(result.text);
      setCursor(result.cursor);
    },
    [value, cursor, maxLength],
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
        let pos = cursor;
        while (pos > 0 && value[pos - 1] === " ") pos--;
        while (pos > 0 && value[pos - 1] !== " ") pos--;
        setCursor(pos);
        return true;
      }

      if (key.name === "right" && key.option) {
        let pos = cursor;
        while (pos < value.length && value[pos] !== " ") pos++;
        while (pos < value.length && value[pos] === " ") pos++;
        setCursor(pos);
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

      if (key.name === "backspace" && key.meta) {
        const newPos = 0;
        const newText = value.slice(cursor);
        setValue(newText);
        setCursor(newPos);
        return true;
      }

      if (key.name === "backspace" && key.option) {
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

      // Ignore escape key
      if (key.name === "escape") {
        return false;
      }

      // Ignore arrow keys and other non-printable keys
      const ignoredKeys = ["up", "down", "pageup", "pagedown", "home", "end", "insert", "delete", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"];
      if (ignoredKeys.includes(key.name)) {
        return false;
      }

      if (key.sequence && !key.ctrl && !key.meta) {
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
