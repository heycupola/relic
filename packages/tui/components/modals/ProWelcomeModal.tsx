/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

interface ProWelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ProWelcomeModal({ visible, onClose }: ProWelcomeModalProps) {
  useKeyboard((key) => {
    if (visible && (key.name === "escape" || key.name === "return")) onClose();
  });

  return (
    <Modal
      visible={visible}
      title="Welcome to Pro!"
      width={50}
      shortcuts={[{ key: "esc", description: "close" }]}
    >
      <box flexDirection="column" gap={1}>
        <text fg={THEME_COLORS.success}>You're now a PRO member!</text>
        <text fg={THEME_COLORS.text}>More projects and sharing unlocked.</text>
      </box>
    </Modal>
  );
}
