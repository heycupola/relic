import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { useCursorBlink } from "../../hooks/useCursorBlink";
import { useSingleLineInput } from "../../hooks/useInput";
import { usePaste } from "../../hooks/usePaste";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { ShareLimits } from "../../types/api";
import { THEME_COLORS } from "../../utils/constants";
import { InlineInput } from "../forms/InlineInput";
import { Modal } from "../shared/Modal";

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/.test(
    email,
  );
}

interface Collaborator {
  id: string;
  email: string;
  name: string;
  publicKey: string | null;
}

interface ManageCollaboratorsModalProps {
  visible: boolean;
  projectName: string;
  collaborators: Collaborator[];
  pendingEmail?: string | null;
  shareLimits?: ShareLimits | null;
  onAdd?: (email: string) => void;
  onRevoke?: (collaborator: Collaborator) => void;
  onRevokeWithRotation?: (collaborator: Collaborator) => void;
  onClose: () => void;
}

export function ManageCollaboratorsModal({
  visible,
  projectName,
  collaborators,
  onClose,
  onAdd,
  onRevoke,
  onRevokeWithRotation,
  pendingEmail,
  shareLimits,
}: ManageCollaboratorsModalProps) {
  const { isRunning } = useTaskQueue();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [creatingCollab, setCreatingCollab] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<Collaborator | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const input = useSingleLineInput({ maxLength: 50 });
  const _cursorVisible = useCursorBlink(creatingCollab);

  const displayEmail = pendingEmail || submittedEmail;
  if (!pendingEmail && submittedEmail) {
    setSubmittedEmail(null);
  }

  usePaste((text) => {
    if (!creatingCollab) return;
    input.handlePaste(text.replace(/\s/g, "").slice(0, 50));
  });

  useKeyboard((key) => {
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
        setEmailError(null);
        input.setValue("");
      } else if (key.name === "return") {
        const email = input.value.trim();
        if (!email) {
          setEmailError("Required");
          return;
        }
        if (!isValidEmail(email)) {
          setEmailError("Invalid email");
          return;
        }
        onAdd?.(email);
        setSubmittedEmail(email);
        setCreatingCollab(false);
        setEmailError(null);
        input.setValue("");
      } else {
        input.handleKey(key);
      }
      return;
    }

    if (key.name === "escape") {
      onClose();
    } else if (key.name === "n") {
      setCreatingCollab(true);
      setEmailError(null);
      input.setValue("");
    } else if (key.name === "k" || key.name === "up") {
      setSelectedIndex((p) => (p > 0 ? p - 1 : collaborators.length - 1));
    } else if (key.name === "j" || key.name === "down") {
      setSelectedIndex((p) => (p < collaborators.length - 1 ? p + 1 : 0));
    } else if (key.name === "d") {
      const collab = collaborators[selectedIndex];
      if (collab) setConfirmingDelete(collab);
    }
  });

  if (!visible) return null;

  const currentCollabCount = collaborators.length;
  const limitText = shareLimits
    ? `${currentCollabCount}/${shareLimits.totalSharesCount} shares`
    : `${currentCollabCount} share${currentCollabCount !== 1 ? "s" : ""}`;

  return (
    <Modal
      visible={true}
      title={`Manage Collaborators · ${projectName}`}
      width={65}
      shortcuts={[
        { key: "n", description: "add", disabled: creatingCollab || isRunning },
        { key: "d", description: "revoke", disabled: creatingCollab || isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg={THEME_COLORS.textMuted}>Active Collaborators</text>
          <text fg={THEME_COLORS.textDim}>{limitText}</text>
        </box>

        <box
          flexDirection="column"
          height={
            collaborators.length === 0 && !creatingCollab
              ? 1
              : Math.min(collaborators.length + (creatingCollab ? 1 : 0), 8)
          }
        >
          {collaborators.length === 0 && !creatingCollab ? (
            <text fg={THEME_COLORS.textDim}>No collaborators. Press 'n' to add one.</text>
          ) : (
            <>
              {collaborators.map((collab, index) => {
                const isSelected = index === selectedIndex && !creatingCollab;
                const isConfirming = confirmingDelete?.id === collab.id;

                return (
                  <box key={collab.id} flexDirection="column">
                    <box height={1}>
                      <text>
                        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                          {isSelected ? "› " : "  "}
                        </span>
                        <span fg={THEME_COLORS.text}>{collab.email}</span>
                        <span fg={THEME_COLORS.textDim}> ({collab.name})</span>
                      </text>
                    </box>
                    {isConfirming && (
                      <box height={1} marginLeft={2}>
                        <text>
                          <span fg={THEME_COLORS.textDim}> └─ </span>
                          <span fg={THEME_COLORS.error}>✕</span>
                          <span fg={THEME_COLORS.text}> Revoke access? </span>
                          <span fg={THEME_COLORS.textDim}>[</span>
                          <span fg={THEME_COLORS.success}>y</span>
                          <span fg={THEME_COLORS.textDim}>] yes [</span>
                          <span fg={THEME_COLORS.accent}>r</span>
                          <span fg={THEME_COLORS.textDim}>] yes+rotate [</span>
                          <span fg={THEME_COLORS.error}>n</span>
                          <span fg={THEME_COLORS.textDim}>] no</span>
                        </text>
                      </box>
                    )}
                  </box>
                );
              })}
              {creatingCollab && (
                <InlineInput
                  active={true}
                  initialValue=""
                  maxWidth={40}
                  maxLength={50}
                  placeholder="email@example.com"
                  isFocused={true}
                  error={emailError}
                  showIcon={false}
                  showCount={false}
                  icon="[+]"
                  iconColor={THEME_COLORS.success}
                />
              )}
            </>
          )}
        </box>

        {displayEmail && (
          <box height={1}>
            <text>
              <span fg={THEME_COLORS.primary}>› </span>
              <span fg={THEME_COLORS.textMuted}>Adding </span>
              <span fg={THEME_COLORS.accent}>{displayEmail}</span>
              <span fg={THEME_COLORS.textMuted}>...</span>
            </text>
          </box>
        )}

        {shareLimits && shareLimits.totalSharesCount > 0 && (
          <box height={1}>
            <text fg={THEME_COLORS.textDim}>
              {shareLimits.unusedShares > 0
                ? `${shareLimits.unusedShares} free share${shareLimits.unusedShares !== 1 ? "s" : ""} remaining`
                : `Using ${currentCollabCount} of ${shareLimits.totalSharesCount} shares`}
            </text>
          </box>
        )}
      </box>
    </Modal>
  );
}
