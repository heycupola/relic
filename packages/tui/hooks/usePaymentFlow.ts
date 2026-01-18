import { useCallback, useState } from "react";
import type { PaymentConfirmationType } from "../components/modals/ConfirmPaymentModal";
import type { CheckoutReason } from "../components/modals/UrlOpenModal";
import { useTaskQueue } from "./useTaskQueue";

interface PaymentResult {
  success?: boolean;
  requiresConfirmation?: boolean;
  requiresProPlan?: boolean;
  requiresAdditionalProject?: boolean;
  requiresAdditionalShare?: boolean;
  paymentFailed?: boolean;
  checkoutUrl?: string | null;
  billingPortalUrl?: string | null;
  balance?: number;
  freeLimit?: number;
  message?: string;
}

interface UsePaymentFlowOptions {
  onSuccess?: (message: string) => void;
  onProRequired?: (url: string) => void;
  onPaymentFailed?: (url: string) => void;
}

export function usePaymentFlow(options: UsePaymentFlowOptions = {}) {
  const { cancelTask, showSuccess, showError } = useTaskQueue();

  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    type: PaymentConfirmationType;
    itemName?: string;
    balance: number;
  }>({ visible: false, type: "project", balance: 0 });

  const [checkoutModal, setCheckoutModal] = useState<{
    visible: boolean;
    url: string;
    reason: CheckoutReason;
  }>({ visible: false, url: "", reason: "pro_required" });

  const [billingPortalModal, setBillingPortalModal] = useState<{
    visible: boolean;
    url: string;
  }>({ visible: false, url: "" });

  const closeAll = useCallback(() => {
    setConfirmationModal({ visible: false, type: "project", balance: 0 });
    setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
    setBillingPortalModal({ visible: false, url: "" });
  }, []);

  const handleResult = useCallback(
    (result: PaymentResult, type: PaymentConfirmationType, itemName?: string) => {
      if (result.success) {
        closeAll();
        const successMsg =
          result.message ||
          `${type === "project" ? "Project" : "Collaborator"} ${itemName ? `"${itemName}" ` : ""}created`;
        showSuccess(successMsg);
        options.onSuccess?.(successMsg);
        return;
      }

      if (result.requiresConfirmation) {
        setConfirmationModal({
          visible: true,
          type,
          itemName,
          balance: result.balance ?? 0,
        });
        return;
      }

      if (
        result.requiresProPlan ||
        result.requiresAdditionalProject ||
        result.requiresAdditionalShare
      ) {
        cancelTask();
        if (result.checkoutUrl && result.checkoutUrl !== null) {
          const reason: CheckoutReason = result.requiresProPlan
            ? "pro_required"
            : result.requiresAdditionalProject
              ? "project_limit"
              : "share_limit";
          setCheckoutModal({ visible: true, url: result.checkoutUrl, reason });
          options.onProRequired?.(result.checkoutUrl);
        } else {
          showError(result.message || "Upgrade required");
        }
        closeAll();
        return;
      }

      if (result.paymentFailed) {
        cancelTask();
        if (result.billingPortalUrl && result.billingPortalUrl !== null) {
          setBillingPortalModal({ visible: true, url: result.billingPortalUrl });
          options.onPaymentFailed?.(result.billingPortalUrl);
        } else {
          showError(result.message || "Payment failed");
        }
        closeAll();
        return;
      }

      if (result.message) {
        cancelTask();
        showError(result.message);
        closeAll();
      }
    },
    [cancelTask, showSuccess, showError, closeAll, options],
  );

  return {
    confirmationModal,
    checkoutModal,
    billingPortalModal,
    handleResult,
    closeConfirmation: () => setConfirmationModal({ visible: false, type: "project", balance: 0 }),
    closeCheckout: () => setCheckoutModal({ visible: false, url: "", reason: "pro_required" }),
    closeBilling: () => setBillingPortalModal({ visible: false, url: "" }),
    closeAll,
  };
}
