import { CHAR_LIMITS, COLLABORATOR_LIMIT, THEME_COLORS } from "../../lib/constants";
import { Modal } from "../Modal";
import { TextInput } from "../TextInput";

interface Collaborator {
  id: string;
  email: string;
  name: string;
}

interface ManageCollaboratorsModalProps {
  visible: boolean;
  collaborators: Collaborator[];
  selectedIndex: number;
  isAddMode: boolean;
  addEmail: string;
  addEmailCursor: number;
  cursorVisible: boolean;
  onClose: () => void;
}

export function ManageCollaboratorsModal({
  visible,
  collaborators,
  selectedIndex,
  isAddMode,
  addEmail,
  addEmailCursor,
  cursorVisible,
  onClose: _onClose,
}: ManageCollaboratorsModalProps) {
  if (!visible) return null;

  const shortcuts = isAddMode
    ? [
        { key: "↵", description: "add" },
        { key: "esc", description: "back" },
      ]
    : [
        { key: "a", description: "add user" },
        { key: "d", description: "revoke" },
        { key: "↑/↓", description: "navigate" },
        { key: "esc", description: "close" },
      ];

  return (
    <Modal
      visible={visible}
      title="Manage Collaborators"
      width={50}
      height={isAddMode ? 8 : 12}
      shortcuts={shortcuts}
    >
      {isAddMode ? (
        <box flexDirection="column" alignItems="center" gap={1}>
          <TextInput
            value={addEmail}
            cursor={addEmailCursor}
            cursorVisible={cursorVisible}
            width={40}
            maxLength={CHAR_LIMITS.email}
            label="Email address:"
          />
        </box>
      ) : (
        <box flexDirection="column" alignItems="center" gap={1} width={40}>
          <box flexDirection="row" justifyContent="space-between" width={40}>
            <text fg={THEME_COLORS.textMuted}>Current collaborators:</text>
            <text fg={THEME_COLORS.textDim}>
              {collaborators.length}/{COLLABORATOR_LIMIT}
            </text>
          </box>
          <box flexDirection="column" width={40} gap={0}>
            {collaborators.length === 0 ? (
              <text fg={THEME_COLORS.textDim}>No collaborators yet. Press 'a' to add one.</text>
            ) : (
              collaborators.map((collab, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <box key={collab.id} height={1}>
                    <text>
                      <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                        {isSelected ? "› " : "  "}
                      </span>
                      <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                        {collab.email}
                      </span>
                      <span fg={THEME_COLORS.textDim}> ({collab.name})</span>
                    </text>
                  </box>
                );
              })
            )}
          </box>
        </box>
      )}
    </Modal>
  );
}
