import { extractErrorMessage } from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import { useRef, useState } from "react";
import type { ShareProjectResult } from "../types/api";
import type { SharedUser } from "../types/models";
import { usePaymentFlow } from "./usePaymentFlow";
import { useTaskQueue } from "./useTaskQueue";

const logger = createLogger("tui");

interface UseCollaboratorActionsOptions {
  shareProject: (email: string, confirmPayment?: boolean) => Promise<ShareProjectResult>;
  revokeShare: (shareId: string) => Promise<void>;
  revokeShareWithRotation: (shareId: string) => Promise<void>;
  onChanged: () => void;
  onKeyRotated?: () => void;
}

export function useCollaboratorActions({
  shareProject,
  revokeShare,
  revokeShareWithRotation,
  onChanged,
  onKeyRotated,
}: UseCollaboratorActionsOptions) {
  const { attemptTask, setTaskPending, continueTask, cancelTask, showSuccess, showError } =
    useTaskQueue();
  const payment = usePaymentFlow();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  const runExclusive = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const addCollaborator = (email: string, confirmPayment = false) =>
    runExclusive(async () => {
      setPendingEmail(email);
      try {
        let result: ShareProjectResult | undefined;
        if (confirmPayment) {
          result = await continueTask(() => shareProject(email, true));
        } else {
          setTaskPending(`Adding collaborator "${email}"...`);
          result = await shareProject(email, false);
        }

        if (!result) {
          setPendingEmail(null);
          payment.closeConfirmation();
          return;
        }

        logger.debug("shareProject result:", JSON.stringify(result, null, 2));
        const outcome = payment.handleResult(result, "collaborator", email);
        if (outcome === "success") {
          trackEvent("collaborator_added", { success: true, confirmed_payment: confirmPayment });
          onChanged();
        }
        if (confirmPayment || outcome !== "requiresConfirmation") setPendingEmail(null);
      } catch (error) {
        cancelTask();
        setPendingEmail(null);
        showError(extractErrorMessage(error));
      }
    });

  const confirmPayment = () => {
    const { itemName } = payment.confirmationModal;
    if (itemName) void addCollaborator(itemName, true);
  };

  const cancelPayment = () => {
    cancelTask();
    payment.closeConfirmation();
    setPendingEmail(null);
  };

  const revokeCollaborator = (collaborator: SharedUser, rotateKeys: boolean) =>
    runExclusive(async () => {
      const revoked = await attemptTask(
        rotateKeys
          ? `Revoking ${collaborator.email} and rotating the project key...`
          : `Revoking ${collaborator.email}...`,
        () => (rotateKeys ? revokeShareWithRotation : revokeShare)(collaborator.id),
      );
      trackEvent(
        "collaborator_revoked",
        revoked ? { success: true, with_rotation: rotateKeys } : { success: false },
      );
      if (!revoked) return;
      showSuccess(
        rotateKeys
          ? `${collaborator.email} revoked and project key rotated`
          : `${collaborator.email} revoked`,
      );
      onChanged();
      if (rotateKeys) onKeyRotated?.();
    });

  return {
    payment,
    pendingEmail,
    isBusy,
    addCollaborator,
    confirmPayment,
    cancelPayment,
    revokeCollaborator,
  };
}
