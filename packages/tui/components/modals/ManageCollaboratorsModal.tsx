import { COLLABORATOR_LIMIT, THEME_COLORS } from "../../utils/constants";
import { InlineInput } from "../forms/InlineInput";
import { Modal } from "../shared/Modal";

interface Collaborator {
  id: string;
  email: string;
  name: string;
}

interface RevokeConfirmationProps {
  collaboratorEmail: string;
  visible: boolean;
}

function RevokeConfirmation({ collaboratorEmail, visible }: RevokeConfirmationProps) {
  if (!visible) return null;

  const displayEmail =
    collaboratorEmail.length > 20 ? `${collaboratorEmail.slice(0, 18)}…` : collaboratorEmail;

  return (
    <box flexDirection="column" marginLeft={2}>
      <box height={1}>
        <text>
          <span fg={THEME_COLORS.textDim}> └─ </span>
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
          <span fg={THEME_COLORS.textMuted}> yes </span>
          <span fg={THEME_COLORS.textDim}>[</span>
          <span fg={THEME_COLORS.accent}>r</span>
          <span fg={THEME_COLORS.textDim}>]</span>
          <span fg={THEME_COLORS.textMuted}> yes + rotate </span>
          <span fg={THEME_COLORS.textDim}>[</span>
          <span fg={THEME_COLORS.error}>n</span>
          <span fg={THEME_COLORS.textDim}>]</span>
          <span fg={THEME_COLORS.textMuted}> no</span>
        </text>
      </box>
    </box>
  );
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

  return (
    <Modal visible={visible} width={50} height={11} shortcuts={shortcuts}>
      <box flexDirection="column" width={44}>
        <box flexDirection="row" alignItems="center">
          <text>
            <span fg={THEME_COLORS.textMuted}>Manage Collaborators</span>
            <span fg={THEME_COLORS.textDim}> · </span>
            <span fg={THEME_COLORS.primary}>{projectName}</span>
          </text>
        </box>

        <box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <text fg={THEME_COLORS.textMuted}>Collaborators</text>
          <text fg={THEME_COLORS.textDim}>
            {collaborators.length}/{COLLABORATOR_LIMIT}
          </text>
        </box>

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
                    <RevokeConfirmation collaboratorEmail={collab.email} visible={isConfirming} />
                  </box>
                );
              })}
              {creatingCollab && (
                <InlineInput
                  value={newCollabInput}
                  cursor={newCollabCursor}
                  cursorVisible={cursorVisible}
                  maxWidth={28}
                  maxLength={50}
                  placeholder="e.g. user@example.com"
                  isFocused={true}
                  showIcon={false}
                  showCount={true}
                />
              )}
            </>
          )}
        </box>
      </box>
    </Modal>
  );
}
