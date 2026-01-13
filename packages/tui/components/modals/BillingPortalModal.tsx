import { useKeyboard } from "@opentui/react";
import open from "open";
import { useEffect, useState } from "react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

type PortalStatus = "pending" | "opening" | "opened";

interface BillingPortalModalProps {
  visible: boolean;
  portalUrl: string;
  onClose: () => void;
}

function getStatusMessage(status: PortalStatus): string {
  switch (status) {
    case "pending":
      return "Preparing billing portal...";
    case "opening":
      return "Opening browser...";
    case "opened":
      return "Manage your billing in the browser.";
  }
}

function getStatusColor(status: PortalStatus): string {
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

export function BillingPortalModal({ visible, portalUrl, onClose }: BillingPortalModalProps) {
  const { isRunning } = useTaskQueue();
  const [status, setStatus] = useState<PortalStatus>("pending");

  // Auto-open browser after delay when modal becomes visible
  useEffect(() => {
    if (visible && portalUrl && status === "pending") {
      const timer = setTimeout(() => {
        setStatus("opening");
        open(portalUrl).then(() => {
          setStatus("opened");
        });
      }, OPEN_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [visible, portalUrl, status]);

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
      open(portalUrl);
      setStatus("opened");
    }
  });

  if (!visible) return null;

  const truncatedUrl = portalUrl.length > 50 ? `${portalUrl.substring(0, 50)}...` : portalUrl;

  return (
    <Modal
      visible={true}
      title="Billing Settings"
      width={60}
      shortcuts={[
        { key: "enter", description: "open link", disabled: isRunning },
        { key: "esc", description: "close", disabled: isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        <text fg={THEME_COLORS.text}>Payment failed. Please add a payment method.</text>

        <text fg={getStatusColor(status)}>{getStatusMessage(status)}</text>

        <box flexDirection="column">
          <text fg={THEME_COLORS.textDim}>If the page didn't open:</text>
          <text fg={THEME_COLORS.primary}>{truncatedUrl}</text>
        </box>

        <text fg={THEME_COLORS.textMuted}>After adding a card, try your action again.</text>
      </box>
    </Modal>
  );
}
