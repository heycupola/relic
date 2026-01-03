import { COLLABORATOR_LIMIT, THEME_COLORS } from "../../lib/constants";
import { Modal } from "../Modal";
import { RevokeCollaboratorConfirmation } from "../RevokeCollaboratorConfirmation";

interface Collaborator {
  id: string;
  email: string;
  name: string;
}

interface ManageCollaboratorsModalProps {
  visible: boolean;
  projectName: string;
  collaborators: Collaborator[];
  selectedIndex: number;
  creatingCollab: boolean;
  newCollabInput: string;
  newCollabCursor: number;
  cursorVisible: boolean;
  confirmingDelete?: { type: string; id: string; name: string } | null;
  onClose: () => void;
}

export function ManageCollaboratorsModal({
  visible,
  projectName,
  collaborators,
  selectedIndex,
  creatingCollab,
  newCollabInput,
  newCollabCursor,
  cursorVisible,
  confirmingDelete,
  onClose: _onClose,
}: ManageCollaboratorsModalProps) {
  if (!visible) return null;

  const shortcuts = creatingCollab
    ? [
      { key: "↵", description: "add" },
      { key: "esc", description: "cancel" },
    ]
    : [
      { key: "a", description: "add" },
      { key: "d", description: "revoke" },
      { key: "esc", description: "close" },
    ];

  // Calculate display text with scrolling for inline input
  const maxWidth = 28;
  const maxLength = 50;
  let displayText = newCollabInput;
  let displayCursor = newCollabCursor;
  let scrollLeft = "";
  let scrollRight = "";

  if (newCollabInput.length > maxWidth) {
    const padding = 3;
    let start = 0;
    if (newCollabCursor > maxWidth - padding) {
      start = Math.min(newCollabCursor - maxWidth + padding, newCollabInput.length - maxWidth);
    }
    start = Math.max(0, start);
    displayText = newCollabInput.slice(start, start + maxWidth);
    displayCursor = newCollabCursor - start;
    if (start > 0) scrollLeft = "◀ ";  // Added space after
    if (start + maxWidth < newCollabInput.length) scrollRight = " ▶";  // Added space before
  }

  return (
    <Modal
      visible={visible}
      width={50}
      height={11}
      shortcuts={shortcuts}
    >
      <box flexDirection="column" width={44}>
        {/* Header with project name */}
        <box flexDirection="row" alignItems="center">
          <text>
            <span fg={THEME_COLORS.textMuted}>Manage Collaborators</span>
            <span fg={THEME_COLORS.textDim}> · </span>
            <span fg={THEME_COLORS.primary}>{projectName}</span>
          </text>
        </box>

        {/* Count */}
        <box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <text fg={THEME_COLORS.textMuted}>Collaborators</text>
          <text fg={THEME_COLORS.textDim}>
            {collaborators.length}/{COLLABORATOR_LIMIT}
          </text>
        </box>

        {/* Collaborators list */}
        <box flexDirection="column" width={44}>
          {collaborators.length === 0 && !creatingCollab ? (
            <text fg={THEME_COLORS.textDim}>No collaborators yet.</text>
          ) : (
            <>
              {collaborators.map((collab, index) => {
                const isSelected = index === selectedIndex && !creatingCollab;
                const isConfirming = confirmingDelete?.id === collab.id;
                return (
                  <box key={collab.id} flexDirection="column">
                    <box height={1}>
                      <text fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                          {isSelected ? "› " : "  "}
                        </span>
                        {collab.email}
                        <span fg={THEME_COLORS.textDim}> ({collab.name})</span>
                      </text>
                    </box>
                    <RevokeCollaboratorConfirmation
                      collaboratorEmail={collab.email}
                      visible={isConfirming}
                    />
                  </box>
                );
              })}
              {creatingCollab && (
                <box height={1} flexDirection="row" justifyContent="space-between">
                  <text>
                    <span fg={THEME_COLORS.primary}>› </span>
                    {newCollabInput.length === 0 ? (
                      <>
                        {cursorVisible ? (
                          <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}> </span>
                        ) : (
                          <span> </span>
                        )}
                        <span fg={THEME_COLORS.textDim}>e.g. user@example.com</span>
                      </>
                    ) : (
                      <>
                        <span fg={THEME_COLORS.textDim}>{scrollLeft}</span>
                        <span fg={THEME_COLORS.text}>{displayText.slice(0, displayCursor)}</span>
                        {cursorVisible ? (
                          <span bg={THEME_COLORS.primary} fg={THEME_COLORS.header}>
                            {displayText[displayCursor] || " "}
                          </span>
                        ) : (
                          <span fg={THEME_COLORS.text}>{displayText[displayCursor] || " "}</span>
                        )}
                        <span fg={THEME_COLORS.text}>{displayText.slice(displayCursor + 1)}</span>
                        <span fg={THEME_COLORS.textDim}>{scrollRight}</span>
                      </>
                    )}
                  </text>
                  <text fg={THEME_COLORS.textDim}>{newCollabInput.length}/{maxLength}</text>
                </box>
              )}
            </>
          )}
        </box>
      </box>
    </Modal>
  );
}
