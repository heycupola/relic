import { useEffect, useRef } from "react";

export function usePaste(callback: (text: string) => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Listen for terminal paste events with Bracketed Paste Mode support
  useEffect(() => {
    const stdin = process.stdin;
    let pasteBuffer = "";
    let isPasting = false;

    const handleData = (raw: string | Buffer) => {
      let data = typeof raw === "string" ? raw : raw.toString("utf-8");

      // Check for bracketed paste start
      if (data.includes("\x1b[200~")) {
        isPasting = true;
        // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional marker detection
        data = data.replace(/\x1b\[200~/g, "");
      }

      // Check for bracketed paste end
      if (data.includes("\x1b[201~")) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional marker detection
        data = data.replace(/\x1b\[201~/g, "");
        pasteBuffer += data;
        isPasting = false;

        // Process the complete paste
        if (pasteBuffer.length > 0) {
          // Clean any remaining escape sequences and control chars
          const cleanText = pasteBuffer
            // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI filtering
            .replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, "") // Remove all ANSI escape sequences
            // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char filtering
            .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""); // Remove control chars except tab, newline, cr

          if (cleanText.length > 0) {
            callbackRef.current(cleanText);
          }
        }
        pasteBuffer = "";
        return;
      }

      // If we're in the middle of a bracketed paste, accumulate
      if (isPasting) {
        pasteBuffer += data;
        return;
      }

      // Fallback: detect paste by multi-character input (for terminals without bracketed paste)
      // But only if not starting with escape sequence
      if (data.length > 1 && !data.startsWith("\x1b")) {
        // Clean the text
        const cleanText = data
          // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI filtering
          .replace(/\x1b\[[0-9;]*[a-zA-Z~]/g, "")
          // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char filtering
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

        if (cleanText.length > 1) {
          callbackRef.current(cleanText);
        }
      }
    };

    stdin.prependListener("data", handleData);
    return () => {
      stdin.off("data", handleData);
    };
  }, []);
}
