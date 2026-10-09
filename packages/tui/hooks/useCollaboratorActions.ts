import { extractErrorMessage } from "@repo/auth";
import { createLogger, trackEvent } from "@repo/logger";
import { useState } from "react";
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
}

export function useCollaboratorActions({
  shareProject,
  revokeShare,
  revokeShareWithRotation,
  onChanged,
}: UseCollaboratorActionsOptions) {
  const { attemptTask, setTaskPending, continueTask, cancelTask, showSuccess, showError } =
    useTaskQueue();
  const payment = usePaymentFlow();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const addCollaborator = async (email: string, confirmPayment = false) => {
    if (isBusy) return;
    setIsBusy(true);
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
      const outcome = payment.handleResult(result, "seat", email);
      if (outcome === "success") {
        trackEvent("collaborator_added", { success: true, confirmed_payment: confirmPayment });
        onChanged();
      }
      if (confirmPayment || outcome !== "requiresConfirmation") setPendingEmail(null);
    } catch (error) {
      cancelTask();
      setPendingEmail(null);
      showError(extractErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const confirmPayment = () => {
    const { itemName } = payment.confirmationModal;
    if (itemName) addCollaborator(itemName, true);
  };

  const cancelPayment = () => {
    cancelTask();
    payment.closeConfirmation();
    setPendingEmail(null);
  };

  const revokeCollaborator = async (collaborator: SharedUser, rotateKeys: boolean) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const revoked = await attemptTask(
        rotateKeys
          ? `Revoking ${collaborator.email} and rotating keys...`
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
          ? `${collaborator.email} revoked and keys rotated`
          : `${collaborator.email} revoked`,
      );
      onChanged();
    } finally {
      setIsBusy(false);
    }
  };

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
