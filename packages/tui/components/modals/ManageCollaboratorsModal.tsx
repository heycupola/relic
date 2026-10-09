/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import type { ShareLimits } from "../../types/api";
import { PRICING, SPINNER_FRAMES, SPINNER_INTERVAL, THEME_COLORS } from "../../utils/constants";
import { truncate } from "../../utils/ui";
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
  /** Set while another modal (payment, checkout) is on top so keys and paste don't leak here. */
  inputDisabled?: boolean;
  onAdd?: (email: string) => void;
  onRevoke?: (collaborator: Collaborator) => void;
  onRevokeWithRotation?: (collaborator: Collaborator) => void;
  onClose: () => void;
}

const MODAL_WIDTH = 65;
const INNER_WIDTH = MODAL_WIDTH - 4;
const MAX_VISIBLE = 8;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function getLimitText(count: number, shareLimits: ShareLimits | null | undefined): string {
  if (!shareLimits) return plural(count, "collaborator");
  if (!shareLimits.hasPro) return `${plural(count, "collaborator")} · Pro required`;
  return `${count}/${shareLimits.freeShareLimit} included · ${PRICING.collaboratorPrice} each beyond`;
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
  inputDisabled = false,
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

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, collaborators.length - 1)));
    setConfirmingDelete((current) =>
      current && collaborators.some((c) => c.id === current.id) ? current : null,
    );
  }, [collaborators]);

  const inputLocked = !visible || isRunning || inputDisabled;

  useKeyboard((key) => {
    if (inputLocked) return;

    if (confirmingDelete) {
      if (key.name === "return" || key.name === "y" || key.name === "r") {
        onRevokeWithRotation?.(confirmingDelete);
        setConfirmingDelete(null);
      } else if (key.name === "s") {
        onRevoke?.(confirmingDelete);
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
    } else if (collaborators.length === 0) {
      return;
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

  const limitText = getLimitText(collaborators.length, shareLimits);
  const showPendingEmail = pendingEmail && !collaborators.some((c) => c.email === pendingEmail);
  const isListEmpty = collaborators.length === 0 && !creatingCollab && !showPendingEmail;
  const scrollOffset = Math.max(0, selectedIndex - MAX_VISIBLE + 1);
  const visibleCollaborators = collaborators.slice(scrollOffset, scrollOffset + MAX_VISIBLE);
  const listHeight = isListEmpty
    ? 1
    : visibleCollaborators.length +
      (creatingCollab ? 1 : 0) +
      (showPendingEmail ? 1 : 0) +
      (confirmingDelete ? 2 : 0);
  const busy = creatingCollab || isRunning || !!showPendingEmail;

  return (
    <Modal
      visible={true}
      title={`Manage collaborators · ${truncate(projectName, INNER_WIDTH - 24)}`}
      width={MODAL_WIDTH}
      shortcuts={
        confirmingDelete
          ? [
              { key: "enter", description: "revoke + rotate key", disabled: isRunning },
              { key: "s", description: "revoke only", disabled: isRunning },
              { key: "esc", description: "cancel", disabled: isRunning },
            ]
          : [
              { key: "n", description: "add", disabled: busy },
              { key: "d", description: "revoke", disabled: busy || collaborators.length === 0 },
              { key: "j/k", description: "move", disabled: busy || collaborators.length < 2 },
              { key: "esc", description: "close", disabled: isRunning },
            ]
      }
    >
      <box flexDirection="column" gap={1}>
        <box height={1} flexDirection="row" justifyContent="space-between">
          <text fg={THEME_COLORS.textMuted}>Active collaborators</text>
          <text fg={THEME_COLORS.textMuted}>{limitText}</text>
        </box>

        <box flexDirection="column" height={listHeight}>
          {isListEmpty ? (
            <text fg={THEME_COLORS.textMuted}>No collaborators yet. Press n to add one.</text>
          ) : (
            <>
              {visibleCollaborators.map((collab, visibleIndex) => {
                const index = visibleIndex + scrollOffset;
                const isSelected = index === selectedIndex && !creatingCollab && !showPendingEmail;
                const isConfirming = confirmingDelete?.id === collab.id;
                const email = truncate(collab.email, INNER_WIDTH - 4);
                const nameRoom = INNER_WIDTH - 2 - email.length - 3;

                return (
                  <box key={collab.id} flexDirection="column">
                    <box height={1}>
                      <text>
                        <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                          {isSelected ? "› " : "  "}
                        </span>
                        <span fg={THEME_COLORS.text}>{email}</span>
                        {collab.name && nameRoom > 4 && (
                          <span fg={THEME_COLORS.textMuted}>
                            {" "}
                            ({truncate(collab.name, nameRoom)})
                          </span>
                        )}
                      </text>
                    </box>
                    {isConfirming && (
                      <box flexDirection="column" marginLeft={2}>
                        <box height={1}>
                          <text>
                            <span fg={THEME_COLORS.textDim}> └─ </span>
                            <span fg={THEME_COLORS.error}>✕</span>
                            <span fg={THEME_COLORS.text}> Revoke access and rotate the key?</span>
                          </text>
                        </box>
                        <box height={1}>
                          <text fg={THEME_COLORS.textMuted}>
                            {"    "}Skipping rotation keeps any copied key valid.
                          </text>
                        </box>
                      </box>
                    )}
                  </box>
                );
              })}

              {showPendingEmail && (
                <box height={1}>
                  <text>
                    <span fg={THEME_COLORS.primary}>{SPINNER_FRAMES[spinnerFrame]} </span>
                    <span fg={THEME_COLORS.textMuted}>
                      {truncate(pendingEmail ?? "", INNER_WIDTH - 14)}
                    </span>
                    <span fg={THEME_COLORS.textMuted}> (adding...)</span>
                  </text>
                </box>
              )}

              {creatingCollab && (
                <InlineInput
                  active={!inputLocked}
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
