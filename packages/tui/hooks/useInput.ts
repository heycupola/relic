import { useCallback, useRef, useState } from "react";
import type { CursorPosition, Key } from "../types/keyboard";

function insertAt(
  str: string,
  pos: number,
  text: string,
  maxLength?: number,
): { value: string; cursor: number } {
  const before = str.slice(0, pos);
  const after = str.slice(pos);
  const newText = before + text + after;
  const limited = maxLength ? newText.slice(0, maxLength) : newText;
  return { value: limited, cursor: Math.min(pos + text.length, limited.length) };
}

function deleteAt(str: string, pos: number): { value: string; cursor: number } {
  if (pos === 0) return { value: str, cursor: 0 };
  return { value: str.slice(0, pos - 1) + str.slice(pos), cursor: pos - 1 };
}

function wordBoundaryBefore(str: string, pos: number): number {
  if (pos === 0) return 0;
  let p = pos - 1;
  while (p > 0 && /\s/.test(str[p] ?? "")) p--;
  while (p > 0 && !/\s/.test(str[p - 1] ?? "")) p--;
  return p;
}

function wordBoundaryAfter(str: string, pos: number): number {
  let p = pos;
  while (p < str.length && !/\s/.test(str[p] ?? "")) p++;
  while (p < str.length && /\s/.test(str[p] ?? "")) p++;
  return p;
}

interface SingleLineInputOptions {
  initialValue?: string;
  maxLength?: number;
  onSubmit?: (value: string) => void;
}

export function useSingleLineInput(options: SingleLineInputOptions = {}) {
  const { initialValue = "", maxLength = 1000, onSubmit } = options;
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(0);
  const stateRef = useRef({ value, cursor });
  stateRef.current = { value, cursor };

  const reset = useCallback(() => {
    setValue(initialValue);
    setCursor(0);
  }, [initialValue]);

  const handlePaste = useCallback(
    (text: string) => {
      const current = stateRef.current;
      const result = insertAt(current.value, current.cursor, text, maxLength);
      setValue(result.value);
      setCursor(result.cursor);
      stateRef.current = result;
    },
    [maxLength],
  );

  const handleKey = useCallback(
    (key: Key): boolean => {
      if (key.name === "return" && onSubmit) {
        onSubmit(value);
        return true;
      }

      if (key.name === "escape") return false;
      if (key.name === "a" && key.ctrl) {
        setCursor(0);
        return true;
      }
      if (key.name === "e" && key.ctrl) {
        setCursor(value.length);
        return true;
      }
      if (key.name === "left") {
        if (key.meta) setCursor(0);
        else if (key.option) setCursor(wordBoundaryBefore(value, cursor));
        else setCursor((p) => Math.max(0, p - 1));
        return true;
      }
      if (key.name === "right") {
        if (key.meta) setCursor(value.length);
        else if (key.option) setCursor(wordBoundaryAfter(value, cursor));
        else setCursor((p) => Math.min(value.length, p + 1));
        return true;
      }

      // Deletion
      if (key.name === "u" && key.ctrl) {
        setValue("");
        setCursor(0);
        return true;
      }
      if (key.name === "backspace") {
        if (key.meta || key.option) {
          const newPos = wordBoundaryBefore(value, cursor);
          setValue(value.slice(0, newPos) + value.slice(cursor));
          setCursor(newPos);
        } else {
          const result = deleteAt(value, cursor);
          setValue(result.value);
          setCursor(result.cursor);
        }
        return true;
      }
      if (key.sequence && !key.ctrl && !key.meta && !key.option) {
        const charCode = key.sequence.charCodeAt(0);
        const isPrintable = key.sequence.length === 1 && charCode >= 32 && charCode !== 127;
        if (!isPrintable) return false;

        const result = insertAt(value, cursor, key.sequence, maxLength);
        setValue(result.value);
        setCursor(result.cursor);
        return true;
      }

      return false;
    },
    [value, cursor, maxLength, onSubmit],
  );

  return { value, cursor, setValue, setCursor, reset, handleKey, handlePaste };
}

interface MultiLineInputOptions {
  initialValue?: string;
  maxLines?: number;
}

function linesToPosition(lines: string[], pos: CursorPosition): number {
  let index = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) {
    index += (lines[i]?.length ?? 0) + 1;
  }
  return index + Math.min(pos.column, lines[pos.line]?.length ?? 0);
}

function indexToPosition(value: string, index: number): CursorPosition {
  const lines = value.split("\n");
  let remaining = index;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i]?.length ?? 0;
    if (remaining <= lineLen) {
      return { line: i, column: remaining };
    }
    remaining -= lineLen + 1;
  }
  return { line: lines.length - 1, column: lines[lines.length - 1]?.length ?? 0 };
}

export function useMultiLineInput(options: MultiLineInputOptions = {}) {
  const { initialValue = "", maxLines = 100 } = options;
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 0, column: 0 });
  const stateRef = useRef({ value, cursor });
  stateRef.current = { value, cursor };

  const lines = value.split("\n");

  const reset = useCallback(() => {
    setValue(initialValue);
    setCursor({ line: 0, column: 0 });
  }, [initialValue]);

  const handlePaste = useCallback(
    (text: string) => {
      const current = stateRef.current;
      const currentLines = current.value.split("\n");
      const index = linesToPosition(currentLines, current.cursor);
      const newValue = current.value.slice(0, index) + text + current.value.slice(index);
      const newLines = newValue.split("\n");
      if (newLines.length > maxLines) return;
      setValue(newValue);
      const newCursor = indexToPosition(newValue, index + text.length);
      setCursor(newCursor);
      stateRef.current = { value: newValue, cursor: newCursor };
    },
    [maxLines],
  );

  const handleKey = useCallback(
    (key: Key): boolean => {
      const currentLine = lines[cursor.line] || "";
      if (key.name === "a" && key.ctrl) {
        setCursor({ ...cursor, column: 0 });
        return true;
      }
      if (key.name === "e" && key.ctrl) {
        setCursor({ ...cursor, column: currentLine.length });
        return true;
      }
      if (key.name === "up") {
        if (key.meta) setCursor({ line: 0, column: 0 });
        else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          setCursor({ line: cursor.line - 1, column: Math.min(cursor.column, prevLine.length) });
        }
        return true;
      }
      if (key.name === "down") {
        if (key.meta) {
          const lastLine = lines[lines.length - 1] || "";
          setCursor({ line: lines.length - 1, column: lastLine.length });
        } else if (cursor.line < lines.length - 1) {
          const nextLine = lines[cursor.line + 1] || "";
          setCursor({ line: cursor.line + 1, column: Math.min(cursor.column, nextLine.length) });
        }
        return true;
      }
      if (key.name === "left") {
        if (key.meta) setCursor({ ...cursor, column: 0 });
        else if (key.option)
          setCursor({ ...cursor, column: wordBoundaryBefore(currentLine, cursor.column) });
        else if (cursor.column > 0) setCursor({ ...cursor, column: cursor.column - 1 });
        else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          setCursor({ line: cursor.line - 1, column: prevLine.length });
        }
        return true;
      }
      if (key.name === "right") {
        if (key.meta) setCursor({ ...cursor, column: currentLine.length });
        else if (key.option)
          setCursor({ ...cursor, column: wordBoundaryAfter(currentLine, cursor.column) });
        else if (cursor.column < currentLine.length)
          setCursor({ ...cursor, column: cursor.column + 1 });
        else if (cursor.line < lines.length - 1) setCursor({ line: cursor.line + 1, column: 0 });
        return true;
      }

      // Deletion
      if (key.name === "u" && key.ctrl) {
        const index = linesToPosition(lines, cursor);
        const lineStart = linesToPosition(lines, { line: cursor.line, column: 0 });
        setValue(value.slice(0, lineStart) + value.slice(index));
        setCursor({ ...cursor, column: 0 });
        return true;
      }
      if (key.name === "backspace") {
        if (key.meta || key.option) {
          const col = wordBoundaryBefore(currentLine, cursor.column);
          const index = linesToPosition(lines, cursor);
          const targetIndex = linesToPosition(lines, { line: cursor.line, column: col });
          setValue(value.slice(0, targetIndex) + value.slice(index));
          setCursor({ ...cursor, column: col });
        } else if (cursor.column > 0) {
          const index = linesToPosition(lines, cursor);
          setValue(value.slice(0, index - 1) + value.slice(index));
          setCursor({ ...cursor, column: cursor.column - 1 });
        } else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          const index = linesToPosition(lines, cursor);
          setValue(value.slice(0, index - 1) + value.slice(index));
          setCursor({ line: cursor.line - 1, column: prevLine.length });
        }
        return true;
      }
      if (key.name === "return") {
        if (lines.length >= maxLines) return true;
        const index = linesToPosition(lines, cursor);
        setValue(`${value.slice(0, index)}\n${value.slice(index)}`);
        setCursor({ line: cursor.line + 1, column: 0 });
        return true;
      }
      if (key.name === "tab") {
        const index = linesToPosition(lines, cursor);
        setValue(`${value.slice(0, index)}  ${value.slice(index)}`);
        setCursor({ ...cursor, column: cursor.column + 2 });
        return true;
      }
      if (
        key.sequence &&
        !key.ctrl &&
        !key.meta &&
        !key.option &&
        key.name !== "return" &&
        key.name !== "tab"
      ) {
        const charCode = key.sequence.charCodeAt(0);
        const isPrintable = key.sequence.length === 1 && charCode >= 32 && charCode !== 127;
        if (!isPrintable) return false;

        const index = linesToPosition(lines, cursor);
        const newValue = value.slice(0, index) + key.sequence + value.slice(index);
        const newLines = newValue.split("\n");
        if (newLines.length > maxLines) return true;
        setValue(newValue);
        setCursor(indexToPosition(newValue, index + key.sequence.length));
        return true;
      }

      return false;
    },
    [value, cursor, lines, maxLines],
  );

  return { value, lines, cursor, setValue, setCursor, reset, handleKey, handlePaste };
}
