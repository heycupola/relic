import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

interface PasswordChangeWarningModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PasswordChangeWarningModal({
  visible,
  onConfirm,
  onCancel,
}: PasswordChangeWarningModalProps) {
  const [selectedOption, setSelectedOption] = useState<"confirm" | "cancel">("cancel");

  useEffect(() => {
    if (visible) {
      setSelectedOption("cancel");
    }
  }, [visible]);

  useKeyboard((key) => {
    if (!visible) return;

    if (key.name === "left" || key.name === "h") {
      setSelectedOption("cancel");
      return;
    }

    if (key.name === "right" || key.name === "l") {
      setSelectedOption("confirm");
      return;
    }

    if (key.name === "return") {
      if (selectedOption === "confirm") {
        onConfirm();
      } else {
        onCancel();
      }
      return;
    }

    if (key.name === "escape") {
      onCancel();
      return;
    }
  });

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      title="Password Change Warning"
      width={60}
      height={12}
      shortcuts={[
        { key: "←→", description: "navigate" },
        { key: "enter", description: "select" },
        { key: "esc", description: "cancel" },
      ]}
    >
      <box flexDirection="column" width={56} gap={1}>
        <box height={1}>
          <text fg={THEME_COLORS.accent}>
            [!] You entered a different password than your previous one
          </text>
        </box>

        <box height={1}>
          <text fg={THEME_COLORS.text}>
            This operation will need to rewrap all your owned project keys and shared project keys.
          </text>
        </box>

        <box height={1} marginTop={1}>
          <text fg={THEME_COLORS.textDim}>
            If you cancel, you can return to the password setup screen and enter your old password.
          </text>
        </box>

        <box height={1} marginTop={1} flexDirection="row" gap={2} justifyContent="center">
          <box
            flexDirection="row"
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={
              selectedOption === "cancel" ? THEME_COLORS.primary : THEME_COLORS.header
            }
          >
            <text fg={selectedOption === "cancel" ? THEME_COLORS.background : THEME_COLORS.text}>
              {selectedOption === "cancel" ? "> " : "  "}Cancel
            </text>
          </box>

          <box
            flexDirection="row"
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={
              selectedOption === "confirm" ? THEME_COLORS.primary : THEME_COLORS.header
            }
          >
            <text fg={selectedOption === "confirm" ? THEME_COLORS.background : THEME_COLORS.text}>
              {selectedOption === "confirm" ? "> " : "  "}Continue
            </text>
          </box>
        </box>
      </box>
    </Modal>
  );
}
