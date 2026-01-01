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
  mode: "list" | "add" | "confirmRevoke";
  addEmail: string;
  addEmailCursor: number;
  cursorVisible: boolean;
  onClose: () => void;
}

export function ManageCollaboratorsModal({
  visible,
  collaborators,
  selectedIndex,
  mode,
  addEmail,
  addEmailCursor,
  cursorVisible,
  onClose: _onClose,
}: ManageCollaboratorsModalProps) {
  if (!visible) return null;

  const selectedCollaborator = collaborators[selectedIndex];

  // Dynamic title based on mode
  const getTitle = () => {
    if (mode === "add") return "Add New Collaborator";
    if (mode === "confirmRevoke") return "Revoke Access";
    return "Manage Collaborators";
  };

  // Dynamic shortcuts based on mode
  const getShortcuts = () => {
    if (mode === "add") {
      return [
        { key: "↵", description: "add" },
        { key: "esc", description: "back" },
      ];
    }
    if (mode === "confirmRevoke") {
      return [
        { key: "y", description: "yes" },
        { key: "n", description: "no" },
      ];
    }
    return [
      { key: "a", description: "add" },
      { key: "d", description: "revoke" },
      { key: "esc", description: "close" },
    ];
  };

  // Dynamic height based on mode
  const getHeight = () => {
    if (mode === "add") return 9;
    if (mode === "confirmRevoke") return 8;
    return 13;
  };

  return (
    <Modal
      visible={visible}
      title={getTitle()}
      width={50}
      height={getHeight()}
      shortcuts={getShortcuts()}
    >
      {mode === "add" && (
        <box flexDirection="column" alignItems="center">
          <TextInput
            value={addEmail}
            cursor={addEmailCursor}
            cursorVisible={cursorVisible}
            width={40}
            maxLength={CHAR_LIMITS.email}
            label="Email address:"
          />
        </box>
      )}
      {mode === "confirmRevoke" && selectedCollaborator && (
        <box flexDirection="column" alignItems="center">
          <text fg={THEME_COLORS.text}>Revoke {selectedCollaborator.name}'s access?</text>
        </box>
      )}
      {mode === "list" && (
        <box flexDirection="column" alignItems="center" width={44}>
          <box flexDirection="row" justifyContent="space-between" width={44}>
            <text fg={THEME_COLORS.textMuted}>Collaborators:</text>
            <text fg={THEME_COLORS.textDim}>
              {collaborators.length}/{COLLABORATOR_LIMIT}
            </text>
          </box>
          <box flexDirection="column" width={44} marginTop={1}>
            {collaborators.length === 0 ? (
              <text fg={THEME_COLORS.textDim}>No collaborators yet.</text>
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
