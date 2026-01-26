import { useKeyboard } from "@opentui/react";
import type { Key } from "../types/keyboard";

interface ModalKeyboardOptions {
  visible: boolean;
  disabled?: boolean;
  onEscape?: () => void;
  onReturn?: () => void;
  onTab?: (shift: boolean) => void;
  onCustom?: (key: Key) => boolean | undefined;
}

export function useModalKeyboard({
  visible,
  disabled = false,
  onEscape,
  onReturn,
  onTab,
  onCustom,
}: ModalKeyboardOptions) {
  useKeyboard((key) => {
    if (!visible || disabled) return;

    if (onCustom) {
      const handled = onCustom(key);
      if (handled) return;
    }

    if (key.name === "escape" && onEscape) {
      onEscape();
      return;
    }

    if (key.name === "return" && onReturn) {
      onReturn();
      return;
    }

    if (key.name === "tab" && onTab) {
      onTab(key.shift || false);
      return;
    }
  });
}
