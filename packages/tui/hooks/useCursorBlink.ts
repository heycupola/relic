import { useEffect, useState } from "react";

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
