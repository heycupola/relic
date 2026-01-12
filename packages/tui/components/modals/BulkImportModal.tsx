import { useMemo } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { CursorPosition } from "../../types";
import type {
  BulkImportSecret,
  CollisionAction,
  CollisionInfo,
  ValidationResult,
} from "../../utils/bulkImportTypes";
import { validateBulkImportJson } from "../../utils/bulkImportValidator";
import { THEME_COLORS } from "../../utils/constants";
import { parseEnvContent } from "../../utils/envParser";
import { highlightLine } from "../../utils/syntaxHighlight";
import { mapCursorToWrappedLines, wrapLine } from "../../utils/wordWrap";
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

const EDITOR_HEIGHT = 18;
const EDITOR_WIDTH = 76;

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
      { key: "⌥j", description: format === "env" ? "advanced" : "simple", disabled: isRunning },
      { key: "⌥s", description: "save", disabled: isRunning },
      { key: "esc", description: "cancel", disabled: isRunning },
    ];
  };

  const lines = content.split("\n");
  const visibleLines = EDITOR_HEIGHT - 2;
  const maxLineWidth = EDITOR_WIDTH - 8; // Account for line numbers and padding

  // Map cursor to wrapped lines
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

    // Map wrapped line indices back to original line numbers
    // and track which wrapped lines are the first line of their original line
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
      const lineNum = isFirstLine ? String(originalLineNum + 1).padStart(3, " ") : "   "; // Empty space for continuation lines

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
    <Modal visible={visible} title="Edit Secrets" width={80} height={28} shortcuts={getShortcuts()}>
      <box flexDirection="column" width={EDITOR_WIDTH}>
        <box flexDirection="row" justifyContent="space-between">
          <text>
            <span fg={THEME_COLORS.textMuted}>Format: </span>
            <span fg={THEME_COLORS.primary}>{format === "env" ? ".env" : "JSON"}</span>
          </text>
          <text fg={THEME_COLORS.textDim}>
            {format === "json" && "• Set type and scope per secret"}
            {format === "env" && "• Paste your .env file"}
          </text>
        </box>
        <box
          height={EDITOR_HEIGHT}
          width={EDITOR_WIDTH}
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
              <span fg={THEME_COLORS.textDim}>{validationResult.errors[0]?.message}</span>
            </text>
          )}
          {validationResult.valid && (
            <text>
              <span fg={THEME_COLORS.success}>✓ </span>
              <span fg={THEME_COLORS.textMuted}>
                {validationResult.secrets.length} secrets ready
              </span>
              {collisions.length > 0 && (
                <span fg={THEME_COLORS.accent}>
                  {" "}
                  · {collisions.length} collision{collisions.length > 1 ? "s" : ""}
                </span>
              )}
            </text>
          )}
          {!validationResult.valid && validationResult.errors.length === 0 && (
            <text fg={THEME_COLORS.textDim}>Start typing or paste content...</text>
          )}
        </box>
        <box height={1} marginTop={1}>
          <text fg={THEME_COLORS.textDim}>ℹ Secrets will be added to the current path only</text>
        </box>
      </box>
    </Modal>
  );
}

export type { BulkImportSecret, CollisionAction, CollisionInfo };
