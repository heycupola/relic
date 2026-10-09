import { useCallback, useMemo, useState } from "react";
import type { PaymentConfirmationType } from "../components/modals/ConfirmPaymentModal";
import type { CreateProjectResult, ShareProjectResult } from "../types/api";
import { useTaskQueue } from "./useTaskQueue";

type PaymentResult = CreateProjectResult | ShareProjectResult;

export type PaymentOutcome =
  | { kind: "success" }
  | { kind: "requiresConfirmation"; balance: number }
  | { kind: "requiresProPlan"; checkoutUrl: string | null; message?: string }
  | { kind: "failed"; message?: string };

interface ConfirmationState {
  visible: boolean;
  type: PaymentConfirmationType;
  itemName?: string;
  balance: number;
}

const CLOSED_CONFIRMATION: ConfirmationState = { visible: false, type: "project", balance: 0 };

function toOutcome(result: PaymentResult): PaymentOutcome {
  if ("status" in result) {
    switch (result.status) {
      case "success":
        return { kind: "success" };
      case "requiresConfirmation":
        return { kind: "requiresConfirmation", balance: result.balance };
      case "requiresProPlan":
        return {
          kind: "requiresProPlan",
          checkoutUrl: result.checkoutUrl,
          message: result.message,
        };
    }
  }
  if (result.success) return { kind: "success" };
  if ("requiresConfirmation" in result) return { kind: "requiresConfirmation", balance: 0 };
  if ("requiresProPlan" in result) {
    return { kind: "requiresProPlan", checkoutUrl: result.checkoutUrl, message: result.message };
  }
  return { kind: "failed", message: result.message };
}

function successMessage(type: PaymentConfirmationType, itemName?: string): string {
  const name = itemName ? `"${itemName}" ` : "";
  return type === "project" ? `Project ${name}created` : `Collaborator ${name}added`;
}

export function usePaymentFlow() {
  const { cancelTask, showSuccess, showError } = useTaskQueue();
  const [confirmationModal, setConfirmationModal] =
    useState<ConfirmationState>(CLOSED_CONFIRMATION);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const closeConfirmation = useCallback(() => setConfirmationModal(CLOSED_CONFIRMATION), []);
  const closeCheckout = useCallback(() => setCheckoutUrl(null), []);
  const closeAll = useCallback(() => {
    setConfirmationModal(CLOSED_CONFIRMATION);
    setCheckoutUrl(null);
  }, []);

  const handleResult = useCallback(
    (
      result: PaymentResult,
      type: PaymentConfirmationType,
      itemName?: string,
    ): PaymentOutcome["kind"] => {
      const outcome = toOutcome(result);
      switch (outcome.kind) {
        case "success":
          closeAll();
          showSuccess(successMessage(type, itemName));
          break;
        case "requiresConfirmation":
          setConfirmationModal({ visible: true, type, itemName, balance: outcome.balance });
          break;
        case "requiresProPlan":
          cancelTask();
          closeAll();
          if (outcome.checkoutUrl) setCheckoutUrl(outcome.checkoutUrl);
          else showError(outcome.message || "Pro plan required");
          break;
        case "failed":
          cancelTask();
          closeAll();
          if (outcome.message) showError(outcome.message);
          break;
      }
      return outcome.kind;
    },
    [cancelTask, showSuccess, showError, closeAll],
  );

  return useMemo(
    () => ({
      confirmationModal,
      checkoutUrl,
      isModalOpen: confirmationModal.visible || checkoutUrl !== null,
      handleResult,
      closeConfirmation,
      closeCheckout,
      closeAll,
    }),
    [confirmationModal, checkoutUrl, handleResult, closeConfirmation, closeCheckout, closeAll],
  );
}
