import { THEME_COLORS } from "../../utils/constants";

interface DeleteConfirmationProps {
  itemType: "project" | "environment" | "folder" | "secret" | "collaborator";
  itemName: string;
  visible: boolean;
}

export function DeleteConfirmation({ itemType, itemName, visible }: DeleteConfirmationProps) {
  if (!visible) return null;

  const actionText = itemType === "collaborator" ? "Revoke access to" : "Delete";
  const displayName = itemName.length > 20 ? `${itemName.slice(0, 18)}…` : itemName;

  return (
    <box height={1} marginLeft={2}>
      <text>
        <span fg={THEME_COLORS.textDim}> └─ </span>
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

export function getDeleteConfirmationShortcuts() {
  return [
    { key: "y", description: "confirm" },
    { key: "n", description: "cancel" },
  ];
}
