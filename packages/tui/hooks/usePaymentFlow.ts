import { useCallback, useState } from "react";
import type { PaymentConfirmationType } from "../components/modals/ConfirmPaymentModal";
import type { CheckoutReason } from "../components/modals/UrlOpenModal";
import { useTaskQueue } from "./useTaskQueue";

type PaymentResult =
  | {
      success?: boolean;
      requiresConfirmation?: boolean;
      requiresProPlan?: boolean;
      requiresAdditionalProject?: boolean;
      requiresAdditionalShare?: boolean;
      requiresRemoval?: boolean;
      currentUsage?: number;
      includedUsage?: number;
      excessCount?: number;
      paymentFailed?: boolean;
      checkoutUrl?: string | null;
      billingPortalUrl?: string | null;
      balance?: number;
      freeLimit?: number;
      message?: string;
    }
  | {
      status: "success";
      paymentFailed?: boolean;
      message?: string;
    }
  | {
      status: "requiresProPlan";
      checkoutUrl: string | null;
      message?: string;
    }
  | {
      status: "requiresConfirmation";
      balance: number;
      freeLimit: number;
      message?: string;
    }
  | {
      status: "requiresRemoval";
      currentUsage: number;
      includedUsage: number;
      excessCount: number;
      message?: string;
    };

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
      const normalized =
        "status" in result
          ? result.status === "success"
            ? {
                success: !result.paymentFailed,
                paymentFailed: result.paymentFailed,
                message: result.message,
              }
            : result.status === "requiresProPlan"
              ? {
                  success: false,
                  requiresProPlan: true,
                  checkoutUrl: result.checkoutUrl,
                  message: result.message,
                }
              : result.status === "requiresRemoval"
                ? {
                    success: false,
                    requiresRemoval: true,
                    currentUsage: result.currentUsage,
                    includedUsage: result.includedUsage,
                    excessCount: result.excessCount,
                    message: result.message,
                  }
                : {
                    success: false,
                    requiresConfirmation: true,
                    balance: result.balance,
                    freeLimit: result.freeLimit,
                    message: result.message,
                  }
          : result;

      if (normalized.paymentFailed) {
        cancelTask();
        setConfirmationModal({ visible: false, type: "project", balance: 0 });
        setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
        if (normalized.billingPortalUrl && normalized.billingPortalUrl !== null) {
          setBillingPortalModal({ visible: true, url: normalized.billingPortalUrl });
          options.onPaymentFailed?.(normalized.billingPortalUrl);
        } else {
          setBillingPortalModal({ visible: false, url: "" });
          showError(normalized.message || "Payment failed");
        }
        return;
      }

      if (normalized.success) {
        closeAll();
        const successMsg =
          normalized.message ||
          `${type === "project" ? "Project" : "Collaborator"} ${itemName ? `"${itemName}" ` : ""}created`;
        showSuccess(successMsg);
        options.onSuccess?.(successMsg);
        return;
      }

      if (normalized.requiresConfirmation) {
        setConfirmationModal({
          visible: true,
          type,
          itemName,
          balance: normalized.balance ?? 0,
        });
        return;
      }

      if (
        normalized.requiresRemoval ||
        (normalized.currentUsage &&
          normalized.includedUsage &&
          normalized.currentUsage > normalized.includedUsage)
      ) {
        cancelTask();
        setConfirmationModal({ visible: false, type: "project", balance: 0 });
        setBillingPortalModal({ visible: false, url: "" });
        setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
        showError(
          normalized.message ||
            `Usage limit exceeded (${normalized.currentUsage}/${normalized.includedUsage}). Remove ${normalized.excessCount} item(s) or upgrade.`,
        );
        return;
      }

      if (
        normalized.requiresProPlan ||
        normalized.requiresAdditionalProject ||
        normalized.requiresAdditionalShare
      ) {
        cancelTask();
        setConfirmationModal({ visible: false, type: "project", balance: 0 });
        setBillingPortalModal({ visible: false, url: "" });
        if (normalized.checkoutUrl && normalized.checkoutUrl !== null) {
          const reason: CheckoutReason = normalized.requiresProPlan
            ? "pro_required"
            : normalized.requiresAdditionalProject
              ? "project_limit"
              : "share_limit";
          setCheckoutModal({ visible: true, url: normalized.checkoutUrl, reason });
          options.onProRequired?.(normalized.checkoutUrl);
        } else {
          setCheckoutModal({ visible: false, url: "", reason: "pro_required" });
          showError(normalized.message || "Upgrade required");
        }
        return;
      }

      if (normalized.message) {
        cancelTask();
        showError(normalized.message);
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
