import { CHAR_LIMITS } from "../../lib/constants";
import { Modal } from "../Modal";
import { TextInput } from "../TextInput";

interface CreateFolderModalProps {
  visible: boolean;
  value: string;
  cursor: number;
  cursorVisible: boolean;
  onClose: () => void;
}

export function CreateFolderModal({
  visible,
  value,
  cursor,
  cursorVisible,
  onClose: _onClose,
}: CreateFolderModalProps) {
  return (
    <Modal
      visible={visible}
      title="Create Folder"
      width={50}
      height={9}
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
          maxLength={CHAR_LIMITS.folderName}
          label="Folder name:"
          placeholder="e.g. aws, database"
        />
      </box>
    </Modal>
  );
}
