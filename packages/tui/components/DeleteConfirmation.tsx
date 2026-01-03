import { THEME_COLORS } from "../lib/constants";

interface DeleteConfirmationProps {
    /** Type of item being deleted (for display) */
    itemType: "project" | "environment" | "folder" | "secret" | "collaborator";
    /** Name of the item being deleted */
    itemName: string;
    /** Whether to show this confirmation */
    visible: boolean;
}

/**
 * Inline delete confirmation row that appears below the selected item.
 * Shows a styled confirmation prompt with y/n options.
 */
export function DeleteConfirmation({ itemType, itemName, visible }: DeleteConfirmationProps) {
    if (!visible) return null;

    // Action text based on item type
    const actionText = itemType === "collaborator" ? "Revoke access to" : "Delete";

    // Truncate long names
    const displayName = itemName.length > 20 ? itemName.slice(0, 18) + "…" : itemName;

    return (
        <box height={1} marginLeft={2}>
            <text>
                <span fg={THEME_COLORS.textDim}>  └─ </span>
                <span fg={THEME_COLORS.error}>✕</span>
                <span fg={THEME_COLORS.text}> {actionText} </span>
                <span fg={THEME_COLORS.accent}>{displayName}</span>
                <span fg={THEME_COLORS.text}>? </span>
                <span fg={THEME_COLORS.success}>y</span>
                <span fg={THEME_COLORS.textDim}>/</span>
                <span fg={THEME_COLORS.error}>n</span>
            </text>
        </box>
    );
}

/**
 * Helper to get item type display label
 */
export function getDeleteConfirmationShortcuts() {
    return [
        { key: "y", description: "confirm" },
        { key: "n", description: "cancel" },
    ];
}
