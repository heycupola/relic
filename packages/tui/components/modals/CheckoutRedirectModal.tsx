/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import open from "open";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

type OpenStatus = "pending" | "opening" | "opened";

const AUTO_OPEN_DELAY = 1500;

const STATUS_MESSAGES: Record<OpenStatus, string> = {
  pending: "Preparing checkout...",
  opening: "Opening browser...",
  opened: "Waiting for payment...",
};

const STATUS_COLORS: Record<OpenStatus, string> = {
  pending: THEME_COLORS.textMuted,
  opening: THEME_COLORS.primary,
  opened: THEME_COLORS.success,
};

interface CheckoutRedirectModalProps {
  checkoutUrl: string | null;
  onClose: () => void;
}

export function CheckoutRedirectModal({ checkoutUrl, onClose }: CheckoutRedirectModalProps) {
  const { isRunning } = useTaskQueue();
  const [status, setStatus] = useState<OpenStatus>("pending");
  const visible = checkoutUrl !== null;

  useEffect(() => {
    if (checkoutUrl && status === "pending") {
      const timer = setTimeout(() => {
        setStatus("opening");
        open(checkoutUrl).then(() => setStatus("opened"));
      }, AUTO_OPEN_DELAY);
      return () => clearTimeout(timer);
    }
  }, [checkoutUrl, status]);

  useEffect(() => {
    if (!visible) setStatus("pending");
  }, [visible]);

  useKeyboard((key) => {
    if (!checkoutUrl || isRunning) return;
    if (key.name === "escape") onClose();
    else if (key.name === "return") {
      open(checkoutUrl);
      setStatus("opened");
    }
  });

  if (!checkoutUrl) return null;

  const truncatedUrl = checkoutUrl.length > 50 ? `${checkoutUrl.substring(0, 50)}...` : checkoutUrl;

  return (
    <Modal
      visible={true}
      title="Upgrade to Pro"
      width={60}
      shortcuts={[
        { key: "enter", description: "open link", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <text fg={STATUS_COLORS[status]}>{STATUS_MESSAGES[status]}</text>
        <box flexDirection="column">
          <text fg={THEME_COLORS.textDim}>If the page didn't open:</text>
          <text fg={THEME_COLORS.textDim}>{truncatedUrl}</text>
        </box>
      </box>
    </Modal>
  );
}
