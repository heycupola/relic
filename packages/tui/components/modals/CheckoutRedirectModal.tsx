import { useKeyboard } from "@opentui/react";
import open from "open";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

export type CheckoutReason = "pro_required" | "share_limit" | "project_limit";

type CheckoutStatus = "pending" | "opening" | "opened";

interface CheckoutRedirectModalProps {
  visible: boolean;
  checkoutUrl: string;
  reason: CheckoutReason;
  onClose: () => void;
}

function getTitle(reason: CheckoutReason): string {
  switch (reason) {
    case "pro_required":
      return "Upgrade to Pro";
    case "share_limit":
      return "Add More Seats";
    case "project_limit":
      return "Add More Projects";
  }
}

function getStatusMessage(status: CheckoutStatus): string {
  switch (status) {
    case "pending":
      return "Preparing checkout...";
    case "opening":
      return "Opening browser...";
    case "opened":
      return "Waiting for payment...";
  }
}

function getStatusColor(status: CheckoutStatus): string {
  switch (status) {
    case "pending":
      return THEME_COLORS.textMuted;
    case "opening":
      return THEME_COLORS.primary;
    case "opened":
      return THEME_COLORS.success;
  }
}

const OPEN_DELAY_MS = 1500;

export function CheckoutRedirectModal({
  visible,
  checkoutUrl,
  reason,
  onClose,
}: CheckoutRedirectModalProps) {
  const { isRunning } = useTaskQueue();
  const [status, setStatus] = useState<CheckoutStatus>("pending");

  const title = getTitle(reason);

  // Auto-open browser after delay when modal becomes visible
  useEffect(() => {
    if (visible && checkoutUrl && status === "pending") {
      const timer = setTimeout(() => {
        setStatus("opening");
        open(checkoutUrl).then(() => {
          setStatus("opened");
        });
      }, OPEN_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [visible, checkoutUrl, status]);

  // Reset status when modal closes
  useEffect(() => {
    if (!visible) {
      setStatus("pending");
    }
  }, [visible]);

  useKeyboard((key) => {
    if (!visible || isRunning) return;

    if (key.name === "escape") {
      onClose();
    } else if (key.name === "return") {
      open(checkoutUrl);
      setStatus("opened");
    }
  });

  if (!visible) return null;

  const truncatedUrl = checkoutUrl.length > 50 ? `${checkoutUrl.substring(0, 50)}...` : checkoutUrl;

  return (
    <Modal
      visible={true}
      title={title}
      width={60}
      shortcuts={[
        { key: "enter", description: "open link", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <text fg={getStatusColor(status)}>{getStatusMessage(status)}</text>

        <box flexDirection="column">
          <text fg={THEME_COLORS.textDim}>If the page didn't open:</text>
          <text fg={THEME_COLORS.primary}>{truncatedUrl}</text>
        </box>
      </box>
    </Modal>
  );
}
