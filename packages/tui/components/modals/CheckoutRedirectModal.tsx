/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { openUrl } from "../../utils/ui";
import { Modal } from "../shared/Modal";

type OpenStatus = "pending" | "opening" | "opened";

const AUTO_OPEN_DELAY = 1500;
const MODAL_WIDTH = 64;

const OPEN_STATUS: Record<OpenStatus, { message: string; color: string }> = {
  pending: { message: "Preparing checkout...", color: THEME_COLORS.textMuted },
  opening: { message: "Opening browser...", color: THEME_COLORS.primary },
  opened: { message: "Waiting for payment...", color: THEME_COLORS.success },
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
        void openUrl(checkoutUrl).then(() => setStatus("opened"));
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
      void openUrl(checkoutUrl);
      setStatus("opened");
    }
  });

  if (!checkoutUrl) return null;

  const { message, color } = OPEN_STATUS[status];

  return (
    <Modal
      visible={true}
      title="Upgrade to Pro"
      width={MODAL_WIDTH}
      shortcuts={[
        { key: "enter", description: "open link", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <text fg={color}>{message}</text>
        <box flexDirection="column" width={MODAL_WIDTH - 4}>
          <text fg={THEME_COLORS.textMuted}>If the page didn't open, visit:</text>
          <text fg={THEME_COLORS.link} wrapMode="char">
            {checkoutUrl}
          </text>
        </box>
      </box>
    </Modal>
  );
}
