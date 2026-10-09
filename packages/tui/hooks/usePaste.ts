import { decodePasteBytes, stripAnsiSequences } from "@opentui/core";
import { usePaste as useTerminalPaste } from "@opentui/react";

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export function usePaste(callback: (text: string) => void): void {
  useTerminalPaste((event) => {
    const text = stripAnsiSequences(decodePasteBytes(event.bytes)).replace(CONTROL_CHARS, "");
    if (text.length > 0) callback(text);
  });
}
