/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { PRICING, THEME_COLORS } from "../../utils/constants";
import { truncate } from "../../utils/ui";
import { Modal } from "../shared/Modal";

export type PaymentConfirmationType = "collaborator" | "project";

interface ConfirmPaymentModalProps {
  visible: boolean;
  type: PaymentConfirmationType;
  itemName?: string;
  message?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const COPY: Record<PaymentConfirmationType, { title: string; unit: string; price: string }> = {
  collaborator: {
    title: "Add collaborator",
    unit: "collaborator",
    price: PRICING.collaboratorPrice,
  },
  project: { title: "Create project", unit: "project", price: PRICING.projectPrice },
};

const MODAL_WIDTH = 56;

export function ConfirmPaymentModal({
  visible,
  type,
  itemName,
  message,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmPaymentModalProps) {
  const { isRunning } = useTaskQueue();

  useKeyboard((key) => {
    if (!visible || isLoading || isRunning) return;

    if (key.name === "return") {
      onConfirm();
    } else if (key.name === "escape") {
      onCancel();
    }
  });

  if (!visible) return null;

  const { title, unit, price } = COPY[type];
  const label = type === "project" ? "Project: " : "Email: ";

  return (
    <Modal
      visible={true}
      title={title}
      width={MODAL_WIDTH}
      shortcuts={[
        { key: "enter", description: "confirm", disabled: isLoading || isRunning },
        { key: "esc", description: "cancel", disabled: isLoading || isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        {itemName && (
          <text>
            <span fg={THEME_COLORS.textMuted}>{label}</span>
            <span fg={THEME_COLORS.primary}>
              {truncate(itemName, MODAL_WIDTH - 4 - label.length)}
            </span>
          </text>
        )}
        {message ? (
          <text fg={THEME_COLORS.text}>{message}</text>
        ) : (
          <text fg={THEME_COLORS.text}>
            Adding another {unit} costs <span fg={THEME_COLORS.warning}>{price}</span>.
          </text>
        )}

        {isLoading && <text fg={THEME_COLORS.primary}>Processing payment...</text>}
      </box>
    </Modal>
  );
}
