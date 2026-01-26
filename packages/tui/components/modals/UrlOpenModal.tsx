import { useKeyboard } from "@opentui/react";
import open from "open";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

type OpenStatus = "pending" | "opening" | "opened";

export type CheckoutReason = "pro_required" | "share_limit" | "project_limit";

interface UrlOpenModalProps {
  visible: boolean;
  url: string;
  onClose: () => void;
  checkoutReason?: CheckoutReason;
  isBillingPortal?: boolean;
  title?: string;
  message?: string;
  hint?: string;
  autoOpenDelay?: number;
}

const STATUS_MESSAGES = {
  pending: {
    checkout: "Preparing checkout...",
    billing: "Preparing billing portal...",
    generic: "Preparing...",
  },
  opening: {
    checkout: "Opening browser...",
    billing: "Opening browser...",
    generic: "Opening browser...",
  },
  opened: {
    checkout: "Waiting for payment...",
    billing: "Manage your billing in the browser.",
    generic: "Opened in browser.",
  },
};

const STATUS_COLORS = {
  pending: THEME_COLORS.textMuted,
  opening: THEME_COLORS.primary,
  opened: THEME_COLORS.success,
};

const CHECKOUT_TITLES = {
  pro_required: "Upgrade to Pro",
  share_limit: "Add More Shares",
  project_limit: "Add More Projects",
};

export function UrlOpenModal({
  visible,
  url,
  onClose,
  checkoutReason,
  isBillingPortal = false,
  title,
  message,
  hint,
  autoOpenDelay = 1500,
}: UrlOpenModalProps) {
  const { isRunning } = useTaskQueue();
  const [status, setStatus] = useState<OpenStatus>("pending");

  useEffect(() => {
    if (visible && url && status === "pending") {
      const timer = setTimeout(() => {
        setStatus("opening");
        open(url).then(() => setStatus("opened"));
      }, autoOpenDelay);
      return () => clearTimeout(timer);
    }
  }, [visible, url, status, autoOpenDelay]);

  useEffect(() => {
    if (!visible) setStatus("pending");
  }, [visible]);

  useKeyboard((key) => {
    if (!visible || isRunning) return;
    if (key.name === "escape") onClose();
    else if (key.name === "return") {
      open(url);
      setStatus("opened");
    }
  });

  if (!visible) return null;

  const truncatedUrl = url.length > 50 ? `${url.substring(0, 50)}...` : url;

  // Determine title and messages
  const modalTitle =
    title ||
    (checkoutReason
      ? CHECKOUT_TITLES[checkoutReason]
      : isBillingPortal
        ? "Billing Settings"
        : "Open Link");
  const variant = checkoutReason ? "checkout" : isBillingPortal ? "billing" : "generic";
  const statusMessage = STATUS_MESSAGES[status][variant];
  const defaultMessage = isBillingPortal
    ? "Payment failed. Please add a payment method."
    : undefined;
  const defaultHint = isBillingPortal ? "After adding a card, try your action again." : undefined;

  return (
    <Modal
      visible={true}
      title={modalTitle}
      width={60}
      shortcuts={[
        { key: "enter", description: "open link", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        {(message || defaultMessage) && (
          <text fg={THEME_COLORS.text}>{message || defaultMessage}</text>
        )}
        <text fg={STATUS_COLORS[status]}>{statusMessage}</text>
        <box flexDirection="column">
          <text fg={THEME_COLORS.textDim}>If the page didn't open:</text>
          <text fg={THEME_COLORS.textDim}>{truncatedUrl}</text>
        </box>
        {(hint || defaultHint) && <text fg={THEME_COLORS.textMuted}>{hint || defaultHint}</text>}
      </box>
    </Modal>
  );
}

export function CheckoutRedirectModal({
  visible,
  checkoutUrl,
  reason,
  onClose,
}: {
  visible: boolean;
  checkoutUrl: string;
  reason: CheckoutReason;
  onClose: () => void;
}) {
  return (
    <UrlOpenModal visible={visible} url={checkoutUrl} checkoutReason={reason} onClose={onClose} />
  );
}

export function BillingPortalModal({
  visible,
  portalUrl,
  onClose,
}: {
  visible: boolean;
  portalUrl: string;
  onClose: () => void;
}) {
  return (
    <UrlOpenModal visible={visible} url={portalUrl} isBillingPortal={true} onClose={onClose} />
  );
}
