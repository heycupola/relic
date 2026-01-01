import { CHAR_LIMITS, THEME_COLORS } from "../../lib/constants";
import { Modal } from "../Modal";
import { TextInput } from "../TextInput";

export type SecretValueType = "string" | "number" | "boolean";

const VALUE_TYPES: SecretValueType[] = ["string", "number", "boolean"];

interface CreateSecretModalProps {
  visible: boolean;
  keyValue: string;
  keyCursor: number;
  secretValue: string;
  secretCursor: number;
  cursorVisible: boolean;
  focusedField: "key" | "value" | "type";
  valueType: SecretValueType;
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
  valueType,
  onClose: _onClose,
}: CreateSecretModalProps) {
  return (
    <Modal
      visible={visible}
      title="Create Secret"
      width={50}
      height={15}
      shortcuts={[
        { key: "↵", description: "create" },
        { key: "tab", description: "next" },
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
        <box flexDirection="column" width={40}>
          <text fg={THEME_COLORS.textMuted}>Type:</text>
          <box flexDirection="row" gap={2} marginTop={0}>
            {VALUE_TYPES.map((type) => {
              const isSelected = type === valueType;
              const isFocused = focusedField === "type";
              return (
                <text key={type}>
                  <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                    {isSelected ? "◉" : "○"}
                  </span>
                  <span fg={isSelected && isFocused ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                    {" "}
                    {type}
                  </span>
                </text>
              );
            })}
          </box>
        </box>
      </box>
    </Modal>
  );
}
