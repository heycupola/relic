import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useInlineInput } from "../../hooks/useInlineInput";
import { usePaste } from "../../hooks/usePaste";
import { COLLABORATOR_LIMIT, KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
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

/**
 * Props for controlled mode - parent manages all state
 */
interface ControlledProps {
  /** Currently selected collaborator index */
  selectedIndex: number;
  /** Whether user is adding a new collaborator */
  creatingCollab: boolean;
  /** New collaborator email input */
  newCollabInput: string;
  /** Cursor position in input */
  newCollabCursor: number;
  /** Whether cursor is visible */
  cursorVisible: boolean;
  /** Currently confirming delete for which collaborator */
  confirmingDelete?: { type: string; id: string; name: string } | null;
  /** Callbacks for smart mode */
  onAdd?: never;
  onRevoke?: never;
  onRevokeWithRotation?: never;
}

/**
 * Props for smart mode - component manages own state
 */
interface SmartProps {
  /** Currently selected collaborator index */
  selectedIndex?: never;
  /** Whether user is adding a new collaborator */
  creatingCollab?: never;
  /** New collaborator email input */
  newCollabInput?: never;
  /** Cursor position in input */
  newCollabCursor?: never;
  /** Whether cursor is visible */
  cursorVisible?: never;
  /** Currently confirming delete for which collaborator */
  confirmingDelete?: never;
  /** Called when user adds a new collaborator */
  onAdd?: (email: string) => void;
  /** Called when user revokes a collaborator (without rotation) */
  onRevoke?: (collaborator: Collaborator) => void;
  /** Called when user revokes with key rotation */
  onRevokeWithRotation?: (collaborator: Collaborator) => void;
}

interface CommonProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Name of the project */
  projectName: string;
  /** List of current collaborators */
  collaborators: Collaborator[];
  /** Called when modal should close */
  onClose: () => void;
}

type ManageCollaboratorsModalProps = CommonProps & (ControlledProps | SmartProps);

/**
 * Determines if props are for controlled mode
 */
function isControlled(
  props: ManageCollaboratorsModalProps,
): props is CommonProps & ControlledProps {
  return "selectedIndex" in props && props.selectedIndex !== undefined;
}

/**
 * ManageCollaboratorsModal - A modal for managing project collaborators
 *
 * Supports two modes:
 * 1. **Controlled mode**: Pass all state props - parent manages state
 * 2. **Smart mode**: Pass callbacks - component manages own state
 *
 * Smart mode handles:
 * - Navigation (up/down, j/k)
 * - Adding collaborators ('a' key, then type email)
 * - Revoking ('d' key, then y/n/r confirmation)
 * - Escape to close or cancel
 *
 * @example
 * // Smart mode (recommended)
 * <ManageCollaboratorsModal
 *   visible={showModal}
 *   projectName="my-project"
 *   collaborators={collaboratorsList}
 *   onAdd={(email) => addCollaborator(email)}
 *   onRevoke={(collab) => revokeAccess(collab.id)}
 *   onRevokeWithRotation={(collab) => revokeAndRotate(collab.id)}
 *   onClose={() => setShowModal(false)}
 * />
 */
export function ManageCollaboratorsModal(props: ManageCollaboratorsModalProps) {
  const { visible, projectName, collaborators } = props;

  if (!visible) return null;

  if (!isControlled(props)) {
    return <SmartManageCollaboratorsModal {...props} />;
  }

  return (
    <ManageCollaboratorsDisplay
      projectName={projectName}
      collaborators={collaborators}
      selectedIndex={props.selectedIndex}
      creatingCollab={props.creatingCollab}
      newCollabInput={props.newCollabInput}
      newCollabCursor={props.newCollabCursor}
      cursorVisible={props.cursorVisible}
      confirmingDelete={props.confirmingDelete}
    />
  );
}

/**
 * Smart mode implementation
 */
function SmartManageCollaboratorsModal({
  projectName,
  collaborators,
  onClose,
  onAdd,
  onRevoke,
  onRevokeWithRotation,
}: CommonProps & SmartProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [creatingCollab, setCreatingCollab] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<Collaborator | null>(null);

  const input = useInlineInput({ maxLength: 50 });
  const cursorVisible = useCursorBlink(creatingCollab);

  usePaste((text) => {
    if (!creatingCollab) return;
    const cleanText = text.replace(/\s/g, "").slice(0, 50);
    input.handlePaste(cleanText);
  });

  useKeyboard((key) => {
    if (confirmingDelete) {
      if (key.name === "y") {
        onRevoke?.(confirmingDelete);
        setConfirmingDelete(null);
      } else if (key.name === "r") {
        onRevokeWithRotation?.(confirmingDelete);
        setConfirmingDelete(null);
      } else if (key.name === "n" || key.name === "escape") {
        setConfirmingDelete(null);
      }
      return;
    }

    if (creatingCollab) {
      if (key.name === "escape") {
        setCreatingCollab(false);
        input.reset();
        return;
      }

      if (key.name === "return") {
        const trimmed = input.value.trim();
        if (trimmed) {
          onAdd?.(trimmed);
          setCreatingCollab(false);
          input.reset();
        }
        return;
      }

      input.handleKey(key);
      return;
    }

    if (key.name === "escape") {
      onClose();
      return;
    }

    if (key.name === "a") {
      setCreatingCollab(true);
      input.reset();
      return;
    }

    if (key.name === "d") {
      const collab = collaborators[selectedIndex];
      if (collab) {
        setConfirmingDelete(collab);
      }
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : collaborators.length - 1));
      setConfirmingDelete(null);
      return;
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => (prev < collaborators.length - 1 ? prev + 1 : 0));
      setConfirmingDelete(null);
      return;
    }
  });

  return (
    <ManageCollaboratorsDisplay
      projectName={projectName}
      collaborators={collaborators}
      selectedIndex={selectedIndex}
      creatingCollab={creatingCollab}
      newCollabInput={input.value}
      newCollabCursor={input.cursor}
      cursorVisible={cursorVisible}
      confirmingDelete={
        confirmingDelete
          ? { type: "collab", id: confirmingDelete.id, name: confirmingDelete.email }
          : null
      }
    />
  );
}

/**
 * Pure display component
 */
interface ManageCollaboratorsDisplayProps {
  projectName: string;
  collaborators: Collaborator[];
  selectedIndex: number;
  creatingCollab: boolean;
  newCollabInput: string;
  newCollabCursor: number;
  cursorVisible: boolean;
  confirmingDelete?: { type: string; id: string; name: string } | null;
}

function ManageCollaboratorsDisplay({
  projectName,
  collaborators,
  selectedIndex,
  creatingCollab,
  newCollabInput,
  newCollabCursor,
  cursorVisible,
  confirmingDelete,
}: ManageCollaboratorsDisplayProps) {
  const shortcuts = creatingCollab
    ? [
        { key: KEY_SYMBOLS.enter, description: "add" },
        { key: "esc", description: "cancel" },
      ]
    : [
        { key: "a", description: "add" },
        { key: "d", description: "revoke" },
        { key: "esc", description: "close" },
      ];

  return (
    <Modal visible={true} width={50} height={11} shortcuts={shortcuts}>
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
