import { useRenderer } from "@opentui/react";
import { useEffect } from "react";

type PasteEvent = {
  text: string;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

export function usePaste(callback: (text: string) => void) {
  const renderer = useRenderer();

  useEffect(() => {
    const handlePaste = (event: PasteEvent) => {
      callback(event.text);
    };

    renderer.keyInput.on("paste", handlePaste);

    return () => {
      renderer.keyInput.off("paste", handlePaste);
    };
  }, [renderer, callback]);
}
