import { verifyPassword } from "@repo/auth";
import { createLogger } from "@repo/logger";
import { useCallback, useRef, useState } from "react";

const logger = createLogger("tui");

export function useSessionUnlock() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requireUnlock = (action: () => void) => {
    if (isUnlocked) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setError(null);
    setIsPromptVisible(true);
  };

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setError(null);
    setIsPromptVisible(false);
  }, []);

  const verify = async (password: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setError(null);

    try {
      if (await verifyPassword(password)) {
        setIsUnlocked(true);
        setIsPromptVisible(false);
        const action = pendingActionRef.current;
        pendingActionRef.current = null;
        action?.();
      } else {
        setError("Incorrect password");
      }
    } catch (err) {
      setError("Failed to verify password");
      logger.debug("Password verification failed:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  return { isPromptVisible, isVerifying, error, requireUnlock, verify, cancel };
}
