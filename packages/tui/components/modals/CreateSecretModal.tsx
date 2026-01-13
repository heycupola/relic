import type { SecretScope, SecretValueType } from "../../types";
import { CHAR_LIMITS, KEY_SYMBOLS, THEME_COLORS } from "../../utils/constants";
import { TextInput } from "../forms/TextInput";
import { Modal } from "../shared/Modal";

const VALUE_TYPES: SecretValueType[] = ["string", "number", "boolean"];
const SCOPES: SecretScope[] = ["client", "server", "shared"];

interface CreateSecretModalProps {
  visible: boolean;
  keyValue: string;
  keyCursor: number;
  secretValue: string;
  secretCursor: number;
  cursorVisible: boolean;
  focusedField: "key" | "value" | "type" | "scope";
  valueType: SecretValueType;
  scope: SecretScope;
  disabled?: boolean;
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
  scope,
  disabled = false,
  onClose: _onClose,
}: CreateSecretModalProps) {
  return (
    <Modal
      visible={visible}
      title="Create Secret"
      width={50}
      height={17}
      shortcuts={[
        { key: KEY_SYMBOLS.enter, description: "create", disabled },
        { key: "tab", description: "next", disabled },
        { key: "esc", description: "cancel", disabled },
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
          placeholder="e.g. API_KEY"
          focused={focusedField === "key"}
        />
        <TextInput
          value={secretValue}
          cursor={secretCursor}
          cursorVisible={cursorVisible}
          width={40}
          maxLength={CHAR_LIMITS.secretValue}
          label="Secret Value:"
          placeholder="Enter secret value"
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
        <box flexDirection="column" width={40}>
          <text fg={THEME_COLORS.textMuted}>Scope:</text>
          <box flexDirection="row" gap={2} marginTop={0}>
            {SCOPES.map((s) => {
              const isSelected = s === scope;
              const isFocused = focusedField === "scope";
              return (
                <text key={s}>
                  <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                    {isSelected ? "◉" : "○"}
                  </span>
                  <span fg={isSelected && isFocused ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                    {" "}
                    {s}
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
