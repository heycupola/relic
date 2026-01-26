import { useKeyboard } from "@opentui/react";
import { useTaskQueue } from "../../hooks/useTaskQueue";
import { PRICING, THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

export type PaymentConfirmationType = "seat" | "project";

interface ConfirmPaymentModalProps {
  visible: boolean;
  type: PaymentConfirmationType;
  itemName?: string;
  balance: number;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function getTitle(type: PaymentConfirmationType): string {
  return type === "seat" ? "Add Collaborator" : "Create Project";
}

function getUnitName(type: PaymentConfirmationType): string {
  return type === "seat" ? "share" : "project";
}

function getPrice(type: PaymentConfirmationType): string {
  return type === "seat" ? PRICING.seatPrice : PRICING.projectPrice;
}

export function ConfirmPaymentModal({
  visible,
  type,
  itemName,
  balance,
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

  const title = getTitle(type);
  const unitName = getUnitName(type);
  const price = getPrice(type);
  const hasBalance = balance > 0;

  return (
    <Modal
      visible={true}
      title={title}
      width={56}
      shortcuts={[
        { key: "enter", description: "confirm", disabled: isLoading || isRunning },
        { key: "esc", description: "cancel", disabled: isLoading || isRunning },
      ]}
    >
      <box flexDirection="column" gap={1}>
        {itemName && (
          <text>
            <span fg={THEME_COLORS.textMuted}>{type === "project" ? "Project: " : "Email: "}</span>
            <span fg={THEME_COLORS.primary}>{itemName}</span>
          </text>
        )}
        {hasBalance ? (
          <>
            <text fg={THEME_COLORS.text}>
              This will use <span fg={THEME_COLORS.accent}>1</span> of your{" "}
              <span fg={THEME_COLORS.success}>{balance}</span> purchased {unitName}
              {balance !== 1 ? "s" : ""}.
            </text>
            <text fg={THEME_COLORS.textMuted}>
              Additional {unitName}s require purchased credits.
            </text>
          </>
        ) : (
          <>
            <text fg={THEME_COLORS.text}>
              Adding another {unitName} costs <span fg={THEME_COLORS.accent}>{price}</span>.
            </text>
            <text fg={THEME_COLORS.textMuted}>Additional {unitName}s require payment.</text>
          </>
        )}

        {isLoading && <text fg={THEME_COLORS.primary}>Processing payment...</text>}
      </box>
    </Modal>
  );
}
