import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { ShareLimits } from "../../types/api";
import { SPINNER_FRAMES, SPINNER_INTERVAL, THEME_COLORS } from "../../utils/constants";
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
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [emailValue, setEmailValue] = useState("");

  useEffect(() => {
    if (!pendingEmail) return;
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);
    return () => clearInterval(interval);
  }, [pendingEmail]);

  useKeyboard((key) => {
    if (!visible || isRunning) return;

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
        setEmailValue("");
      } else if (key.name === "return") {
        const email = emailValue.trim();
        if (!email) {
          setEmailError("Required");
          return;
        }
        if (!isValidEmail(email)) {
          setEmailError("Invalid email");
          return;
        }
        onAdd?.(email);
        setCreatingCollab(false);
        setEmailError(null);
        setEmailValue("");
      }
      return;
    }

    if (key.name === "escape") {
      onClose();
    } else if (key.name === "n") {
      setCreatingCollab(true);
      setEmailError(null);
      setEmailValue("");
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

  const getLimitText = () => {
    if (!shareLimits) {
      return `${currentCollabCount} share${currentCollabCount !== 1 ? "s" : ""}`;
    }

    if (shareLimits.hasPro) {
      const totalLimit = shareLimits.freeShareLimit + shareLimits.unusedShares;
      return `${currentCollabCount}/${totalLimit} shares`;
    }

    return `${currentCollabCount} share${currentCollabCount !== 1 ? "s" : ""}`;
  };

  const limitText = getLimitText();

  const showPendingEmail = pendingEmail && !collaborators.some((c) => c.email === pendingEmail);
  const listHeight =
    collaborators.length === 0 && !creatingCollab && !showPendingEmail
      ? 1
      : Math.min(
          collaborators.length +
            (creatingCollab ? 1 : 0) +
            (showPendingEmail ? 1 : 0) +
            (confirmingDelete ? 1 : 0),
          8 + (confirmingDelete ? 1 : 0),
        );

  return (
    <Modal
      visible={true}
      title={`Manage Collaborators · ${projectName}`}
      width={65}
      shortcuts={[
        {
          key: "n",
          description: "add",
          disabled: creatingCollab || isRunning || !!showPendingEmail,
        },
        {
          key: "d",
          description: "revoke",
          disabled: creatingCollab || isRunning || !!showPendingEmail,
        },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg={THEME_COLORS.textMuted}>Active Collaborators</text>
          <text fg={THEME_COLORS.textDim}>{limitText}</text>
        </box>

        <box flexDirection="column" height={listHeight}>
          {collaborators.length === 0 && !creatingCollab && !showPendingEmail ? (
            <text fg={THEME_COLORS.textDim}>No collaborators. Press 'n' to add one.</text>
          ) : (
            <>
              {collaborators.map((collab, index) => {
                const isSelected = index === selectedIndex && !creatingCollab && !showPendingEmail;
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
                          <span fg={THEME_COLORS.textDim}>] yes + rotate [</span>
                          <span fg={THEME_COLORS.error}>n</span>
                          <span fg={THEME_COLORS.textDim}>] no</span>
                        </text>
                      </box>
                    )}
                  </box>
                );
              })}

              {showPendingEmail && (
                <box height={1}>
                  <text>
                    <span fg={THEME_COLORS.primary}>{SPINNER_FRAMES[spinnerFrame]} </span>
                    <span fg={THEME_COLORS.textMuted}>{pendingEmail}</span>
                    <span fg={THEME_COLORS.textDim}> (adding...)</span>
                  </text>
                </box>
              )}

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
                  onChange={setEmailValue}
                />
              )}
            </>
          )}
        </box>
      </box>
    </Modal>
  );
}
