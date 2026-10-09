/** @jsxImportSource @opentui/react */
import { useTerminalDimensions } from "@opentui/react";
import { useMemo } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { CursorPosition } from "../../types/keyboard";
import type {
  BulkImportSecret,
  CollisionAction,
  CollisionInfo,
  ValidationResult,
} from "../../utils/bulkImport";
import { parseEnvContent, validateBulkImportJson } from "../../utils/bulkImport";
import { THEME_COLORS } from "../../utils/constants";
import { highlightLine, mapCursorToWrappedLines, wrapLine } from "../../utils/ui";
import { Modal } from "../shared/Modal";

interface BulkImportModalProps {
  visible: boolean;
  content: string;
  cursor: CursorPosition;
  format: "env" | "json";
  collisions: CollisionInfo[];
  cursorVisible: boolean;
  onClose: () => void;
}

const MAX_EDITOR_ROWS = 18;
const MIN_EDITOR_ROWS = 5;
const MAX_EDITOR_COLUMNS = 76;
/** Rows the modal needs around the editor: title, format row, status, info, guide bar, padding. */
const MODAL_CHROME_HEIGHT = 15;

export function BulkImportModal({
  visible,
  content,
  cursor,
  format,
  collisions,
  cursorVisible,
  onClose: _onClose,
}: BulkImportModalProps) {
  const { isRunning } = useTaskQueue();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const editorHeight = Math.max(
    MIN_EDITOR_ROWS,
    Math.min(MAX_EDITOR_ROWS, termHeight - MODAL_CHROME_HEIGHT),
  );
  const editorWidth = Math.max(30, Math.min(MAX_EDITOR_COLUMNS, termWidth - 8));

  const validationResult = useMemo((): ValidationResult => {
    const trimmed = content.trim();
    if (trimmed === "") {
      return { valid: false, secrets: [], errors: [], duplicateKeys: [] };
    }

    if (format === "env") {
      const secrets = parseEnvContent(trimmed);
      return validateBulkImportJson(secrets);
    }

    try {
      const parsed = JSON.parse(trimmed);
      return validateBulkImportJson(parsed);
    } catch {
      return {
        valid: false,
        secrets: [],
        errors: [{ message: "Invalid JSON syntax" }],
        duplicateKeys: [],
      };
    }
  }, [content, format]);

  const getShortcuts = () => {
    return [
      { key: "^s", description: "save", disabled: isRunning },
      {
        key: "^t",
        description: format === "env" ? "switch to JSON" : "switch to .env",
        disabled: isRunning,
      },
      { key: "esc", description: "cancel", disabled: isRunning },
    ];
  };

  const lines = content.split("\n");
  const visibleLines = editorHeight - 2;
  const maxLineWidth = editorWidth - 8;

  const { wrappedLine, wrappedColumn, allWrappedLines } = useMemo(
    () => mapCursorToWrappedLines(lines, cursor, maxLineWidth),
    [lines, cursor, maxLineWidth],
  );

  const scrollOffset = Math.max(0, wrappedLine - visibleLines + 1);

  const renderEditorContent = () => {
    if (content === "") {
      return (
        <text>
          <span fg={THEME_COLORS.primary}> 1 │ </span>
          {cursorVisible ? (
            <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
              {" "}
            </span>
          ) : (
            <span fg={THEME_COLORS.textDim}>_</span>
          )}
        </text>
      );
    }

    const visibleStart = scrollOffset;
    const visibleEnd = scrollOffset + visibleLines;
    const visibleWrappedLines = allWrappedLines.slice(visibleStart, visibleEnd);

    const wrappedLineToOriginalLine: number[] = [];
    const isFirstWrappedLine: boolean[] = [];
    for (let i = 0; i < lines.length; i++) {
      const wrapped = wrapLine(lines[i] || "", maxLineWidth);
      for (let j = 0; j < wrapped.length; j++) {
        wrappedLineToOriginalLine.push(i);
        isFirstWrappedLine.push(j === 0);
      }
    }

    return visibleWrappedLines.map((displayLine, i) => {
      const wrappedLineIndex = visibleStart + i;
      const isCursorLine = wrappedLineIndex === wrappedLine;
      const originalLineNum = wrappedLineToOriginalLine[wrappedLineIndex] ?? 0;
      const isFirstLine = isFirstWrappedLine[wrappedLineIndex] ?? true;
      const lineNum = isFirstLine ? String(originalLineNum + 1).padStart(3, " ") : "   ";

      if (!isCursorLine) {
        const highlighted = highlightLine(displayLine || " ", format);
        return (
          <text key={wrappedLineIndex}>
            <span fg={THEME_COLORS.textDim}>{lineNum} │ </span>
            {highlighted.map((part, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: idx is stable here
              <span key={idx} fg={part.color}>
                {part.text}
              </span>
            ))}
          </text>
        );
      }

      const beforeCursor = displayLine.slice(0, wrappedColumn);
      const cursorChar = displayLine[wrappedColumn] || " ";
      const afterCursor = displayLine.slice(wrappedColumn + 1);

      const highlightedBefore = highlightLine(beforeCursor, format);
      const highlightedAfter = highlightLine(afterCursor, format);

      return (
        <text key={wrappedLineIndex}>
          <span fg={THEME_COLORS.primary}>{lineNum} │ </span>
          {beforeCursor &&
            highlightedBefore.map((part, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: idx is stable here
              <span key={`b${idx}`} fg={part.color}>
                {part.text}
              </span>
            ))}
          {cursorVisible ? (
            <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
              {cursorChar}
            </span>
          ) : (
            <span fg={THEME_COLORS.text}>{cursorChar}</span>
          )}
          {highlightedAfter.map((part, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: idx is stable here
            <span key={`a${idx}`} fg={part.color}>
              {part.text}
            </span>
          ))}
        </text>
      );
    });
  };

  return (
    <Modal
      visible={visible}
      title="Edit secrets"
      width={editorWidth + 4}
      height={editorHeight + MODAL_CHROME_HEIGHT - 2}
      shortcuts={getShortcuts()}
    >
      <box flexDirection="column" width={editorWidth}>
        <box flexDirection="row" justifyContent="space-between">
          <text>
            <span fg={THEME_COLORS.textMuted}>Format: </span>
            <span fg={THEME_COLORS.primary}>{format === "env" ? ".env" : "JSON"}</span>
          </text>
          {editorWidth >= 60 && (
            <text fg={THEME_COLORS.textMuted}>
              {format === "json" && "• Set type and scope per secret"}
              {format === "env" && "• Paste your .env file"}
            </text>
          )}
        </box>
        <box
          height={editorHeight}
          width={editorWidth}
          backgroundColor={THEME_COLORS.inputBg}
          marginTop={1}
          paddingLeft={1}
          paddingTop={1}
          flexDirection="column"
        >
          {renderEditorContent()}
          {(() => {
            const wrappedLinesBelow = allWrappedLines.length - (scrollOffset + visibleLines);
            if (wrappedLinesBelow > 0) {
              return (
                <text fg={THEME_COLORS.textDim}>
                  ... {wrappedLinesBelow} more line{wrappedLinesBelow > 1 ? "s" : ""} below
                </text>
              );
            }
            return null;
          })()}
        </box>
        <box height={2} marginTop={1} flexDirection="column">
          {validationResult.errors.length > 0 && (
            <text>
              <span fg={THEME_COLORS.error}>✗ </span>
              <span fg={THEME_COLORS.textMuted}>{validationResult.errors[0]?.message}</span>
            </text>
          )}
          {validationResult.valid && (
            <text>
              <span fg={THEME_COLORS.success}>✓ </span>
              <span fg={THEME_COLORS.textMuted}>
                {validationResult.secrets.length} secrets ready
              </span>
              {collisions.length > 0 && (
                <span fg={THEME_COLORS.warning}>
                  {" "}
                  · will overwrite {collisions.length} secret{collisions.length > 1 ? "s" : ""}{" "}
                  added elsewhere
                </span>
              )}
            </text>
          )}
          {!validationResult.valid && validationResult.errors.length === 0 && (
            <text fg={THEME_COLORS.textMuted}>Start typing or paste content...</text>
          )}
        </box>
        <box height={1} marginTop={1}>
          <text fg={THEME_COLORS.textMuted} wrapMode="none">
            ℹ Saved to the current path only. Removed lines are deleted.
          </text>
        </box>
      </box>
    </Modal>
  );
}

export type { BulkImportSecret, CollisionAction, CollisionInfo };
