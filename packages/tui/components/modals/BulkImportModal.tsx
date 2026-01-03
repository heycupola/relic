import { useMemo } from "react";
import { THEME_COLORS } from "../../lib/constants";
import { isEnvFormat, parseEnvContent } from "../../lib/envParser";
import { validateBulkImportJson } from "../../lib/bulkImportValidator";
import { highlightLine } from "../../lib/syntaxHighlight";
import type {
    BulkImportSecret,
    CollisionAction,
    CollisionInfo,
    ValidationResult,
} from "../../lib/bulkImportTypes";
import type { Position } from "../../lib/useMultilineInput";
import { Modal } from "../Modal";

interface BulkImportModalProps {
    visible: boolean;
    content: string;
    cursor: Position;
    format: "env" | "json";
    collisions: CollisionInfo[];
    cursorVisible: boolean;
    mode: "import" | "update";
    contextPath: string;
    onClose: () => void;
}

function maskValue(value: string, maxLength = 8): string {
    if (value.length <= 4) {
        return "****";
    }
    return value.slice(0, 2) + "****" + value.slice(-2);
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
    mode,
    contextPath,
    onClose: _onClose,
}: BulkImportModalProps) {
    const validationResult = useMemo((): ValidationResult => {
        const trimmed = content.trim();
        if (trimmed === "") {
            return { valid: false, secrets: [], errors: [], duplicateKeys: [] };
        }

        // Validate based on current format
        if (format === "env") {
            const secrets = parseEnvContent(trimmed);
            return validateBulkImportJson(secrets);
        }

        // JSON format
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

    const hasCollisions = collisions.length > 0;

    const getShortcuts = () => {
        if (mode === "update") {
            return [
                { key: "⌥j", description: format === "env" ? "advanced" : "simple" },
                { key: "⌥u", description: "update" },
                { key: "esc", description: "cancel" },
            ];
        }

        const shortcuts = [
            { key: "⌥j", description: format === "env" ? "advanced" : "simple" },
            { key: "⌥i", description: hasCollisions ? "merge" : "import" },
        ];

        if (hasCollisions) {
            shortcuts.push({ key: "⌥o", description: "replace" });
        }

        shortcuts.push({ key: "esc", description: "cancel" });

        return shortcuts;
    };

    const lines = content.split("\n");

    // Calculate scroll offset to keep cursor in view
    const visibleLines = EDITOR_HEIGHT - 2;
    const scrollOffset = Math.max(0, cursor.line - visibleLines + 1);

    // Render lines with cursor
    const renderEditorContent = () => {
        if (content === "") {
            return (
                <text>
                    <span fg={THEME_COLORS.primary}>  1 │ </span>
                    {cursorVisible ? (
                        <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}> </span>
                    ) : (
                        <span fg={THEME_COLORS.textDim}>_</span>
                    )}
                </text>
            );
        }

        const visibleStart = scrollOffset;
        const visibleEnd = scrollOffset + visibleLines;

        return lines.slice(visibleStart, visibleEnd).map((line, i) => {
            const actualLineIndex = visibleStart + i;
            const isCursorLine = actualLineIndex === cursor.line;
            const displayLine = line.slice(0, EDITOR_WIDTH - 8); // Leave room for line numbers
            const lineNum = String(actualLineIndex + 1).padStart(3, " ");

            if (!isCursorLine) {
                const highlighted = highlightLine(displayLine || " ", format);
                return (
                    <text key={actualLineIndex}>
                        <span fg={THEME_COLORS.textDim}>{lineNum} │ </span>
                        {highlighted.map((part, idx) => (
                            <span key={idx} fg={part.color}>{part.text}</span>
                        ))}
                    </text>
                );
            }

            // Render line with cursor - apply highlighting to before/after portions
            const beforeCursor = displayLine.slice(0, cursor.column);
            const cursorChar = displayLine[cursor.column] || " ";
            const afterCursor = displayLine.slice(cursor.column + 1);

            // Highlight full line first to get colors, then split at cursor
            const highlightedBefore = highlightLine(beforeCursor, format);
            const highlightedAfter = highlightLine(afterCursor, format);

            return (
                <text key={actualLineIndex}>
                    <span fg={THEME_COLORS.primary}>{lineNum} │ </span>
                    {beforeCursor && highlightedBefore.map((part, idx) => (
                        <span key={`b${idx}`} fg={part.color}>{part.text}</span>
                    ))}
                    {cursorVisible ? (
                        <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                            {cursorChar}
                        </span>
                    ) : (
                        <span fg={THEME_COLORS.text}>{cursorChar}</span>
                    )}
                    {highlightedAfter.map((part, idx) => (
                        <span key={`a${idx}`} fg={part.color}>{part.text}</span>
                    ))}
                </text>
            );
        });
    };

    return (
        <Modal
            visible={visible}
            title={mode === "update" ? "Batch Edit" : "Batch Add"}
            width={80}
            height={28}
            shortcuts={getShortcuts()}
        >
            <box flexDirection="column" width={EDITOR_WIDTH}>
                <box flexDirection="row" justifyContent="space-between">
                    <text>
                        <span fg={THEME_COLORS.textMuted}>Format: </span>
                        <span fg={THEME_COLORS.primary}>
                            {format === "env" ? ".env" : "JSON"}
                        </span>
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
                        const linesBelow = lines.length - (scrollOffset + visibleLines);
                        if (linesBelow > 0) {
                            return (
                                <text fg={THEME_COLORS.textDim}>
                                    ... {linesBelow} more line{linesBelow > 1 ? "s" : ""} below
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
                            <span fg={THEME_COLORS.textDim}>{validationResult.errors[0].message}</span>
                        </text>
                    )}
                    {validationResult.valid && (
                        <text>
                            <span fg={THEME_COLORS.success}>✓ </span>
                            <span fg={THEME_COLORS.textMuted}>{validationResult.secrets.length} secrets ready</span>
                            {hasCollisions && (
                                <span fg={THEME_COLORS.accent}> · {collisions.length} collision{collisions.length > 1 ? "s" : ""}</span>
                            )}
                        </text>
                    )}
                    {!validationResult.valid && validationResult.errors.length === 0 && (
                        <text fg={THEME_COLORS.textDim}>
                            Start typing or paste content...
                        </text>
                    )}
                </box>
                <box height={1} marginTop={1}>
                    <text fg={THEME_COLORS.textDim}>
                        ℹ Secrets will be added to the current path only
                    </text>
                </box>
            </box>
        </Modal>
    );
}

export type { BulkImportSecret, CollisionAction, CollisionInfo };
