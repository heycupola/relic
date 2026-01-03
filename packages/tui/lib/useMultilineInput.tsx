import { useCallback, useState } from "react";

export interface Key {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option: boolean;
  sequence: string;
}

export interface Position {
  line: number;
  column: number;
}

export interface UseMultilineInputOptions {
  initialValue?: string;
  maxLines?: number;
  maxLineLength?: number;
}

export interface UseMultilineInputReturn {
  value: string;
  lines: string[];
  cursor: Position;
  setValue: (value: string) => void;
  setCursor: (cursor: Position) => void;
  reset: () => void;
  handleKey: (key: Key) => boolean;
  handlePaste: (text: string) => void;
}

function getLines(value: string): string[] {
  return value.split("\n");
}

function positionToIndex(lines: string[], pos: Position): number {
  let index = 0;
  for (let i = 0; i < pos.line && i < lines.length; i++) {
    index += lines[i].length + 1; // +1 for newline
  }
  index += Math.min(pos.column, lines[pos.line]?.length || 0);
  return index;
}

function indexToPosition(value: string, index: number): Position {
  const lines = getLines(value);
  let remaining = index;
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lines[i].length) {
      return { line: i, column: remaining };
    }
    remaining -= lines[i].length + 1;
  }
  return { line: lines.length - 1, column: lines[lines.length - 1]?.length || 0 };
}

export function useMultilineInput({
  initialValue = "",
  maxLines = 100,
  maxLineLength = 200,
}: UseMultilineInputOptions = {}): UseMultilineInputReturn {
  const [value, setValueInternal] = useState(initialValue);
  const [cursor, setCursor] = useState<Position>({ line: 0, column: 0 });

  const lines = getLines(value);

  // Wrapper that also resets cursor when value is completely replaced
  const setValue = useCallback((newValue: string) => {
    setValueInternal(newValue);
    // Reset cursor to start of content
    setCursor({ line: 0, column: 0 });
  }, []);

  const reset = useCallback(() => {
    setValueInternal(initialValue);
    setCursor({ line: 0, column: 0 });
  }, [initialValue]);

  const clampCursor = useCallback((pos: Position, lns: string[]): Position => {
    const line = Math.max(0, Math.min(pos.line, lns.length - 1));
    const column = Math.max(0, Math.min(pos.column, lns[line]?.length || 0));
    return { line, column };
  }, []);

  const handlePaste = useCallback(
    (text: string) => {
      const index = positionToIndex(lines, cursor);
      const newValue = value.slice(0, index) + text + value.slice(index);
      const newLines = getLines(newValue);

      // Limit lines
      if (newLines.length > maxLines) {
        return;
      }

      setValueInternal(newValue);
      const newIndex = index + text.length;
      setCursor(indexToPosition(newValue, newIndex));
    },
    [value, cursor, lines, maxLines],
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

      // Ctrl+U: Delete to line start (Unix standard)
      if (key.name === "u" && key.ctrl) {
        const index = positionToIndex(lines, cursor);
        const lineStart = positionToIndex(lines, { line: cursor.line, column: 0 });
        const newValue = value.slice(0, lineStart) + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: 0 });
        return true;
      }

      // Ctrl+W: Delete word backward (Unix standard)
      if (key.name === "w" && key.ctrl) {
        let col = cursor.column;
        while (col > 0 && currentLine[col - 1] === " ") col--;
        while (col > 0 && currentLine[col - 1] !== " ") col--;
        const index = positionToIndex(lines, cursor);
        const targetIndex = positionToIndex(lines, { line: cursor.line, column: col });
        const newValue = value.slice(0, targetIndex) + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Option+B (meta+b): Jump word backward
      if (key.name === "b" && key.meta) {
        let col = cursor.column;
        while (col > 0 && currentLine[col - 1] === " ") col--;
        while (col > 0 && currentLine[col - 1] !== " ") col--;
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Option+F (meta+f): Jump word forward
      if (key.name === "f" && key.meta) {
        let col = cursor.column;
        while (col < currentLine.length && currentLine[col] !== " ") col++;
        while (col < currentLine.length && currentLine[col] === " ") col++;
        setCursor({ ...cursor, column: col });
        return true;
      }

      // Up arrow
      if (key.name === "up") {
        if (key.meta || key.option) {
          // Cmd+Up or Option+Up: Go to start of file
          setCursor({ line: 0, column: 0 });
        } else {
          if (cursor.line > 0) {
            const prevLine = lines[cursor.line - 1] || "";
            setCursor({
              line: cursor.line - 1,
              column: Math.min(cursor.column, prevLine.length),
            });
          }
        }
        return true;
      }

      // Down arrow
      if (key.name === "down") {
        if (key.meta || key.option) {
          // Cmd+Down or Option+Down: Go to end of file
          const lastLine = lines[lines.length - 1] || "";
          setCursor({ line: lines.length - 1, column: lastLine.length });
        } else {
          if (cursor.line < lines.length - 1) {
            const nextLine = lines[cursor.line + 1] || "";
            setCursor({
              line: cursor.line + 1,
              column: Math.min(cursor.column, nextLine.length),
            });
          }
        }
        return true;
      }

      // Left arrow
      if (key.name === "left") {
        if (key.meta) {
          // Cmd+Left: Go to line start
          setCursor({ ...cursor, column: 0 });
        } else if (key.option) {
          // Option+Left: Jump word backward
          let col = cursor.column;
          while (col > 0 && currentLine[col - 1] === " ") col--;
          while (col > 0 && currentLine[col - 1] !== " ") col--;
          setCursor({ ...cursor, column: col });
        } else {
          if (cursor.column > 0) {
            setCursor({ ...cursor, column: cursor.column - 1 });
          } else if (cursor.line > 0) {
            // Wrap to end of previous line
            const prevLine = lines[cursor.line - 1] || "";
            setCursor({ line: cursor.line - 1, column: prevLine.length });
          }
        }
        return true;
      }

      // Right arrow
      if (key.name === "right") {
        if (key.meta) {
          // Cmd+Right: Go to line end
          setCursor({ ...cursor, column: currentLine.length });
        } else if (key.option) {
          // Option+Right: Jump word forward
          let col = cursor.column;
          while (col < currentLine.length && currentLine[col] !== " ") col++;
          while (col < currentLine.length && currentLine[col] === " ") col++;
          setCursor({ ...cursor, column: col });
        } else {
          if (cursor.column < currentLine.length) {
            setCursor({ ...cursor, column: cursor.column + 1 });
          } else if (cursor.line < lines.length - 1) {
            // Wrap to start of next line
            setCursor({ line: cursor.line + 1, column: 0 });
          }
        }
        return true;
      }

      // Backspace or Delete
      if (key.name === "backspace" || key.name === "delete") {
        if (key.meta || (key.name === "delete" && key.ctrl)) {
          // Cmd+Backspace or Cmd+Delete: Delete to line start
          const index = positionToIndex(lines, cursor);
          const lineStart = positionToIndex(lines, { line: cursor.line, column: 0 });
          const newValue = value.slice(0, lineStart) + value.slice(index);
          setValueInternal(newValue);
          setCursor({ ...cursor, column: 0 });
        } else if (key.option) {
          // Option+Backspace: Delete word backward
          let col = cursor.column;
          while (col > 0 && currentLine[col - 1] === " ") col--;
          while (col > 0 && currentLine[col - 1] !== " ") col--;
          const index = positionToIndex(lines, cursor);
          const targetIndex = positionToIndex(lines, { line: cursor.line, column: col });
          const newValue = value.slice(0, targetIndex) + value.slice(index);
          setValueInternal(newValue);
          setCursor({ ...cursor, column: col });
        } else {
          if (cursor.column > 0) {
            // Delete character before cursor
            const index = positionToIndex(lines, cursor);
            const newValue = value.slice(0, index - 1) + value.slice(index);
            setValueInternal(newValue);
            setCursor({ ...cursor, column: cursor.column - 1 });
          } else if (cursor.line > 0) {
            // Join with previous line
            const prevLine = lines[cursor.line - 1] || "";
            const index = positionToIndex(lines, cursor);
            const newValue = value.slice(0, index - 1) + value.slice(index);
            setValueInternal(newValue);
            setCursor({ line: cursor.line - 1, column: prevLine.length });
          }
        }
        return true;
      }

      // Enter: Insert newline
      if (key.name === "return") {
        if (lines.length >= maxLines) return true;
        const index = positionToIndex(lines, cursor);
        const newValue = value.slice(0, index) + "\n" + value.slice(index);
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

      // Regular character input (ignore modifier keys)
      if (
        key.sequence &&
        !key.ctrl &&
        !key.meta &&
        !key.option &&
        key.name !== "return" &&
        key.name !== "tab"
      ) {
        if (currentLine.length >= maxLineLength) return true;
        const index = positionToIndex(lines, cursor);
        const newValue = value.slice(0, index) + key.sequence + value.slice(index);
        setValueInternal(newValue);
        setCursor({ ...cursor, column: cursor.column + key.sequence.length });
        return true;
      }

      // Ignore unhandled modifier combinations (Cmd/Option+anything) to prevent freezing
      if (key.meta || key.option || key.ctrl) {
        return true;
      }

      return false;
    },
    [value, cursor, lines, maxLines, maxLineLength],
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
