import { THEME_COLORS } from "../lib/constants";

interface RevokeCollaboratorConfirmationProps {
    /** Email of the collaborator being revoked */
    collaboratorEmail: string;
    /** Whether to show this confirmation */
    visible: boolean;
}

/**
 * Inline revoke confirmation for collaborators with three options:
 * - Yes (y): Revokes access without rotating keys
 * - Yes + Rotate (r): Revokes access and rotates all keys (safest)
 * - No (n): Cancel the operation
 */
export function RevokeCollaboratorConfirmation({
    collaboratorEmail,
    visible
}: RevokeCollaboratorConfirmationProps) {
    if (!visible) return null;

    // Truncate long emails
    const displayEmail = collaboratorEmail.length > 20
        ? collaboratorEmail.slice(0, 18) + "…"
        : collaboratorEmail;

    return (
        <box flexDirection="column" marginLeft={2}>
            <box height={1}>
                <text>
                    <span fg={THEME_COLORS.textDim}>  └─ </span>
                    <span fg={THEME_COLORS.error}>✕</span>
                    <span fg={THEME_COLORS.text}> Revoke access to </span>
                    <span fg={THEME_COLORS.accent}>{displayEmail}</span>
                    <span fg={THEME_COLORS.text}>?</span>
                </text>
            </box>
            <box height={1} marginLeft={5}>
                <text>
                    <span fg={THEME_COLORS.textDim}>[</span>
                    <span fg={THEME_COLORS.success}>y</span>
                    <span fg={THEME_COLORS.textDim}>]</span>
                    <span fg={THEME_COLORS.textMuted}> yes  </span>
                    <span fg={THEME_COLORS.textDim}>[</span>
                    <span fg={THEME_COLORS.warning}>r</span>
                    <span fg={THEME_COLORS.textDim}>]</span>
                    <span fg={THEME_COLORS.textMuted}> yes + rotate  </span>
                    <span fg={THEME_COLORS.textDim}>[</span>
                    <span fg={THEME_COLORS.error}>n</span>
                    <span fg={THEME_COLORS.textDim}>]</span>
                    <span fg={THEME_COLORS.textMuted}> no</span>
                </text>
            </box>
        </box>
    );
}
