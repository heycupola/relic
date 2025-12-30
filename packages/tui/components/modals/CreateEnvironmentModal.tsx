import { CHAR_LIMITS } from "../../lib/constants";
import { Modal } from "../Modal";
import { TextInput } from "../TextInput";

interface CreateEnvironmentModalProps {
  visible: boolean;
  value: string;
  cursor: number;
  cursorVisible: boolean;
  onClose: () => void;
}

export function CreateEnvironmentModal({
  visible,
  value,
  cursor,
  cursorVisible,
  onClose: _onClose,
}: CreateEnvironmentModalProps) {
  return (
    <Modal
      visible={visible}
      title="Create Environment"
      width={50}
      height={8}
      shortcuts={[
        { key: "↵", description: "create" },
        { key: "esc", description: "cancel" },
      ]}
    >
      <box flexDirection="column" alignItems="center">
        <TextInput
          value={value}
          cursor={cursor}
          cursorVisible={cursorVisible}
          width={40}
          maxLength={CHAR_LIMITS.envName}
          label="Environment name:"
        />
      </box>
    </Modal>
  );
}
