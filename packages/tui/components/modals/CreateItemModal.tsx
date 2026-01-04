import { CHAR_LIMITS } from "../../utils/constants";
import { TextInput } from "../forms/TextInput";
import { Modal } from "../shared/Modal";

type ItemType = "environment" | "folder";

interface CreateItemModalProps {
  visible: boolean;
  itemType: ItemType;
  value: string;
  cursor: number;
  cursorVisible: boolean;
  onClose: () => void;
}

const ITEM_CONFIGS: Record<
  ItemType,
  {
    title: string;
    label: string;
    placeholder: string;
    maxLength: number;
  }
> = {
  environment: {
    title: "Create Environment",
    label: "Environment name:",
    placeholder: "e.g. production, staging",
    maxLength: CHAR_LIMITS.envName,
  },
  folder: {
    title: "Create Folder",
    label: "Folder name:",
    placeholder: "e.g. aws, database",
    maxLength: CHAR_LIMITS.folderName,
  },
};

export function CreateItemModal({
  visible,
  itemType,
  value,
  cursor,
  cursorVisible,
  onClose: _onClose,
}: CreateItemModalProps) {
  const config = ITEM_CONFIGS[itemType];

  return (
    <Modal
      visible={visible}
      title={config.title}
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
          maxLength={config.maxLength}
          label={config.label}
          placeholder={config.placeholder}
        />
      </box>
    </Modal>
  );
}

export function CreateEnvironmentModal(props: Omit<CreateItemModalProps, "itemType">) {
  return <CreateItemModal {...props} itemType="environment" />;
}

export function CreateFolderModal(props: Omit<CreateItemModalProps, "itemType">) {
  return <CreateItemModal {...props} itemType="folder" />;
}
