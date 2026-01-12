import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { ShareLimits } from "../../convex/api/types";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useInlineInput } from "../../hooks/useInlineInput";
import { usePaste } from "../../hooks/usePaste";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
import { InlineInput } from "../forms/InlineInput";
import { Modal } from "../shared/Modal";

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

interface Collaborator {
  id: string;
  email: string;
  name: string;
  publicKey: string | null;
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
  /** Email currently being added (shown as pending, not editable) */
  pendingEmail?: string | null;
  /** Share limits from backend (freeLimit, purchasedSeats, totalLimit) */
  shareLimits?: ShareLimits | null;
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
  pendingEmail,
  shareLimits,
}: CommonProps & SmartProps) {
  const { isRunning } = useTaskQueue();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [creatingCollab, setCreatingCollab] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<Collaborator | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const input = useInlineInput({ maxLength: 50 });
  const cursorVisible = useCursorBlink(creatingCollab);

  // Clear submittedEmail when pendingEmail becomes null (task completed)
  // Use the actual pendingEmail from parent as source of truth
  const displayEmail = pendingEmail || submittedEmail;

  // When parent says task is done (pendingEmail null) and we had submitted, clear it
  if (!pendingEmail && submittedEmail) {
    setSubmittedEmail(null);
  }

  usePaste((text) => {
    if (!creatingCollab) return;
    const cleanText = text.replace(/\s/g, "").slice(0, 50);
    input.handlePaste(cleanText);
  });

  useKeyboard((key) => {
    // Only block when task is actively running (not waiting for confirmation)
    if (isRunning) return;

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
        setEmailError(null);
        return;
      }

      if (key.name === "return") {
        const trimmed = input.value.trim();
        if (!trimmed) {
          return;
        }
        if (!isValidEmail(trimmed)) {
          setEmailError("Invalid email address");
          return;
        }
        setEmailError(null);
        setCreatingCollab(false);
        setSubmittedEmail(trimmed);
        input.reset();
        onAdd?.(trimmed);
        return;
      }

      // Clear error when user types
      if (emailError) {
        setEmailError(null);
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
      setEmailError(null);
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
      emailError={emailError}
      pendingEmail={displayEmail}
      shareLimits={shareLimits}
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
  emailError?: string | null;
  pendingEmail?: string | null;
  shareLimits?: ShareLimits | null;
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
  emailError,
  pendingEmail,
  shareLimits,
}: ManageCollaboratorsDisplayProps) {
  const { isRunning } = useTaskQueue();
  const totalShares = shareLimits?.totalSharesCount ?? collaborators.length;
  const hasPro = shareLimits?.hasPro ?? false;
  const freeShareLimit = shareLimits?.freeShareLimit ?? 0;
  const unusedShares = shareLimits?.unusedShares ?? 0;

  // Calculate remaining free shares
  const remainingFree = Math.max(0, freeShareLimit - totalShares);

  // Format: "X shares (Y free)" when has remaining free, "X shares" when no remaining free
  const getUsageText = () => {
    if (!hasPro) {
      return null;
    }

    // No remaining free - don't show free
    if (remainingFree === 0) {
      return (
        <text>
          <span fg={THEME_COLORS.textDim}>
            {totalShares} share{totalShares !== 1 ? "s" : ""}
          </span>
          {unusedShares > 0 && (
            <span>
              <span fg={THEME_COLORS.textDim}> · </span>
              <span fg={THEME_COLORS.success}>{unusedShares} left</span>
            </span>
          )}
        </text>
      );
    }

    // Has remaining free - show remaining free
    return (
      <text>
        <span fg={THEME_COLORS.textDim}>
          {totalShares} share{totalShares !== 1 ? "s" : ""}{" "}
        </span>
        <span fg={THEME_COLORS.textDim}>(</span>
        <span fg={THEME_COLORS.success}>{remainingFree} free</span>
        <span fg={THEME_COLORS.textDim}>)</span>
        {unusedShares > 0 && (
          <span>
            <span fg={THEME_COLORS.textDim}> · </span>
            <span fg={THEME_COLORS.success}>{unusedShares} left</span>
          </span>
        )}
      </text>
    );
  };

  const shortcuts = creatingCollab
    ? [
        { key: KEY_SYMBOLS.enter, description: "add", disabled: isRunning },
        { key: "esc", description: "cancel", disabled: isRunning },
      ]
    : [
        { key: "a", description: "add", disabled: isRunning },
        { key: "d", description: "revoke", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ];

  return (
    <Modal visible={true} width={56} height={12} shortcuts={shortcuts}>
      <box flexDirection="column" width={50}>
        <box flexDirection="column">
          <box flexDirection="row" justifyContent="space-between" alignItems="center">
            <text>
              <span fg={THEME_COLORS.textMuted}>Manage Collaborators</span>
              <span fg={THEME_COLORS.textDim}> · </span>
              <span fg={THEME_COLORS.primary}>{projectName}</span>
            </text>
            {!hasPro && <text fg={THEME_COLORS.accent}>upgrade to pro</text>}
          </box>
          {hasPro && <box marginTop={1}>{getUsageText()}</box>}
        </box>

        <box flexDirection="column" width={50} marginTop={1}>
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
              {(creatingCollab || pendingEmail) && (
                <box flexDirection="column">
                  <InlineInput
                    value={pendingEmail || newCollabInput}
                    cursor={pendingEmail ? 0 : newCollabCursor}
                    cursorVisible={pendingEmail ? false : cursorVisible}
                    maxWidth={28}
                    maxLength={50}
                    placeholder="e.g. user@example.com"
                    isFocused={creatingCollab && !pendingEmail}
                    showIcon={false}
                    showCount={creatingCollab && !pendingEmail}
                    muted={!!pendingEmail}
                  />
                  {emailError && <text fg={THEME_COLORS.error}> {emailError}</text>}
                </box>
              )}
            </>
          )}
        </box>
      </box>
    </Modal>
  );
}
