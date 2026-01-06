import { useEffect, useState } from "react";

/**
 * Hook that manages cursor visibility blinking
 * @param shouldBlink - Whether the cursor should blink (typically when modal is open or input is active)
 * @returns The current cursor visibility state
 */
export function useCursorBlink(shouldBlink: boolean): boolean {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!shouldBlink) {
      setCursorVisible(true);
      return;
    }

    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 530);

    return () => clearInterval(interval);
  }, [shouldBlink]);

  return cursorVisible;
}
