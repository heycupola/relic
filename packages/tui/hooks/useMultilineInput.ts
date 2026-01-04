import { useCallback, useRef, useState } from "react";
import type { CursorPosition, Key } from "../types";
import { moveWordBackward, moveWordForward } from "../utils/textInput";

export interface UseMultilineInputOptions {
  initialValue?: string;
  maxLines?: number;
  maxLineLength?: number;
}

export interface UseMultilineInputReturn {
  value: string;
  lines: string[];
  cursor: CursorPosition;
  setValue: (value: string) => void;
  setCursor: (cursor: CursorPosition) => void;
  reset: () => void;
  handleKey: (key: Key) => boolean;
  handlePaste: (text: string) => void;
}

function getLines(value: string): string[] {
  return value.split("\n");
}

function positionToIndex(lines: string[], pos: CursorPosition): number {
  let index = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) {
    index += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }
  index += Math.min(pos.column, lines[pos.line]?.length || 0);
  return index;
}

function indexToPosition(value: string, index: number): CursorPosition {
  const lines = getLines(value);
  let remaining = index;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i]?.length ?? 0;
    if (remaining <= lineLength) {
      return { line: i, column: remaining };
    }
    remaining -= lineLength + 1;
  }
  const lastLine = lines[lines.length - 1] ?? "";
  return { line: lines.length - 1, column: lastLine.length };
}

export function useMultilineInput({
  initialValue = "",
  maxLines = 100,
}: UseMultilineInputOptions = {}): UseMultilineInputReturn {
  const [value, setValueInternal] = useState(initialValue);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 0, column: 0 });

  const lines = getLines(value);

  const setValue = useCallback((newValue: string) => {
    setValueInternal(newValue);
    setCursor({ line: 0, column: 0 });
  }, []);

  const reset = useCallback(() => {
    setValueInternal(initialValue);
    setCursor({ line: 0, column: 0 });
  }, [initialValue]);

  // Use a ref to track pending state for atomic paste operations
  const stateRef = useRef({ value, cursor, lines });
  stateRef.current = { value, cursor, lines };

  const handlePaste = useCallback(
    (text: string) => {
      // Always read from stateRef to get the absolute latest values
      const current = stateRef.current;
      const index = positionToIndex(current.lines, current.cursor);
      const newValue = current.value.slice(0, index) + text + current.value.slice(index);
      const newLines = getLines(newValue);

      if (newLines.length > maxLines) {
        return;
      }

      setValueInternal(newValue);
      const newIndex = index + text.length;
      const newCursor = indexToPosition(newValue, newIndex);
      setCursor(newCursor);
      // Update ref immediately for next paste in same event loop
      stateRef.current = { value: newValue, cursor: newCursor, lines: newLines };
    },
    [maxLines],
  );

  const handleKey = useCallback(
    (key: Key): boolean => {
      const currentLine = lines[cursor.line] || "";

      // Ctrl+A: Go to line start
      if (key.name === "a" && key.ctrl) {
        setCursor({ ...cursor, column: 0 });
        return true;
      }

      // Ctrl+E: Go to line end
      if (key.name === "e" && key.ctrl) {
        setCursor({ ...cursor, column: currentLine.length });
        return true;
      }

      // Ctrl+U: Delete to line start
      if (key.name === "u" && key.ctrl) {
        const index = positionToIndex(lines, cursor);
        const lineStart = positionToIndex(lines, { line: cursor.line, column: 0 });
        const newValue = value.slice(0, lineStart) + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: 0 });
        return true;
      }

      // Ctrl+W: Delete word backward
      if (key.name === "w" && key.ctrl) {
        const col = moveWordBackward(currentLine, cursor.column);
        const index = positionToIndex(lines, cursor);
        const targetIndex = positionToIndex(lines, { line: cursor.line, column: col });
        const newValue = value.slice(0, targetIndex) + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Option+B: Jump word backward
      if (key.name === "b" && key.meta) {
        const col = moveWordBackward(currentLine, cursor.column);
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Option+F: Jump word forward
      if (key.name === "f" && key.meta) {
        const col = moveWordForward(currentLine, cursor.column);
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Up arrow
      if (key.name === "up") {
        // Cmd+Up: Go to document start
        if (key.meta) {
          setCursor({ line: 0, column: 0 });
        } else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          setCursor({
            line: cursor.line - 1,
            column: Math.min(cursor.column, prevLine.length),
          });
        }
        return true;
      }

      // Down arrow
      if (key.name === "down") {
        // Cmd+Down: Go to document end
        if (key.meta) {
          const lastLine = lines[lines.length - 1] || "";
          setCursor({ line: lines.length - 1, column: lastLine.length });
        } else if (cursor.line < lines.length - 1) {
          const nextLine = lines[cursor.line + 1] || "";
          setCursor({
            line: cursor.line + 1,
            column: Math.min(cursor.column, nextLine.length),
          });
        }
        return true;
      }

      // Left arrow
      if (key.name === "left") {
        if (key.meta) {
          setCursor({ ...cursor, column: 0 });
        } else if (key.option) {
          const col = moveWordBackward(currentLine, cursor.column);
          setCursor({ ...cursor, column: col });
        } else if (cursor.column > 0) {
          setCursor({ ...cursor, column: cursor.column - 1 });
        } else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          setCursor({ line: cursor.line - 1, column: prevLine.length });
        }
        return true;
      }

      // Right arrow
      if (key.name === "right") {
        if (key.meta) {
          setCursor({ ...cursor, column: currentLine.length });
        } else if (key.option) {
          const col = moveWordForward(currentLine, cursor.column);
          setCursor({ ...cursor, column: col });
        } else if (cursor.column < currentLine.length) {
          setCursor({ ...cursor, column: cursor.column + 1 });
        } else if (cursor.line < lines.length - 1) {
          setCursor({ line: cursor.line + 1, column: 0 });
        }
        return true;
      }

      // Backspace
      if (key.name === "backspace") {
        // Option+Backspace (key.meta in terminal): Delete word backward
        if (key.meta || key.option) {
          const col = moveWordBackward(currentLine, cursor.column);
          const index = positionToIndex(lines, cursor);
          const targetIndex = positionToIndex(lines, { line: cursor.line, column: col });
          const newValue = value.slice(0, targetIndex) + value.slice(index);
          setValueInternal(newValue);
          setCursor({ ...cursor, column: col });
        } else if (cursor.column > 0) {
          const index = positionToIndex(lines, cursor);
          const newValue = value.slice(0, index - 1) + value.slice(index);
          setValueInternal(newValue);
          setCursor({ ...cursor, column: cursor.column - 1 });
        } else if (cursor.line > 0) {
          const prevLine = lines[cursor.line - 1] || "";
          const index = positionToIndex(lines, cursor);
          const newValue = value.slice(0, index - 1) + value.slice(index);
          setValueInternal(newValue);
          setCursor({ line: cursor.line - 1, column: prevLine.length });
        }
        return true;
      }

      // Enter: Insert newline
      if (key.name === "return") {
        if (lines.length >= maxLines) return true;
        const index = positionToIndex(lines, cursor);
        const newValue = `${value.slice(0, index)}\n${value.slice(index)}`;
        setValueInternal(newValue);
        setCursor({ line: cursor.line + 1, column: 0 });
        return true;
      }

      // Tab: Insert 2 spaces
      if (key.name === "tab") {
        const indent = "  ";
        const index = positionToIndex(lines, cursor);
        const newValue = value.slice(0, index) + indent + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: cursor.column + indent.length });
        return true;
      }

      // Regular character input - also handles Cmd+V paste (multi-character sequence)
      if (
        key.sequence &&
        !key.ctrl &&
        !key.meta &&
        !key.option &&
        key.name !== "return" &&
        key.name !== "tab"
      ) {
        // For multi-character sequences (paste), insert them all
        const index = positionToIndex(lines, cursor);
        const newValue = value.slice(0, index) + key.sequence + value.slice(index);
        const newLines = getLines(newValue);

        // Check line limits for paste
        if (newLines.length > maxLines) {
          return true; // Reject if would exceed max lines
        }

        setValueInternal(newValue);
        const newIndex = index + key.sequence.length;
        setCursor(indexToPosition(newValue, newIndex));
        return true;
      }

      // Ignore unhandled modifier combinations
      if (key.meta || key.option || key.ctrl) {
        return true;
      }

      return false;
    },
    [value, cursor, lines, maxLines],
  );

  return {
    value,
    lines,
    cursor,
    setValue,
    setCursor,
    reset,
    handleKey,
    handlePaste,
  };
}
