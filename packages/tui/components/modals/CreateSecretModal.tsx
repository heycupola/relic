import { CHAR_LIMITS } from "../../lib/constants";
import { Modal } from "../Modal";
import { TextInput } from "../TextInput";

interface CreateSecretModalProps {
  visible: boolean;
  keyValue: string;
  keyCursor: number;
  secretValue: string;
  secretCursor: number;
  cursorVisible: boolean;
  focusedField: "key" | "value";
  onClose: () => void;
}

export function CreateSecretModal({
  visible,
  keyValue,
  keyCursor,
  secretValue,
  secretCursor,
  cursorVisible,
  focusedField,
  onClose: _onClose,
}: CreateSecretModalProps) {
  return (
    <Modal
      visible={visible}
      title="Create Secret"
      width={50}
      height={12}
      shortcuts={[
        { key: "↵", description: "create" },
        { key: "tab", description: "switch" },
        { key: "esc", description: "cancel" },
      ]}
    >
      <box flexDirection="column" alignItems="center" gap={1}>
        <TextInput
          value={keyValue}
          cursor={keyCursor}
          cursorVisible={cursorVisible}
          width={40}
          maxLength={CHAR_LIMITS.secretKey}
          label="Secret Key:"
          focused={focusedField === "key"}
        />
        <TextInput
          value={secretValue}
          cursor={secretCursor}
          cursorVisible={cursorVisible}
          width={40}
          maxLength={CHAR_LIMITS.secretValue}
          label="Secret Value:"
          focused={focusedField === "value"}
        />
      </box>
    </Modal>
  );
}
