import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../context";

export function useProUpgradeNotice(onUpgrade: () => void) {
  const { hasPro, isLoading } = useUser();
  const [visible, setVisible] = useState(false);
  const prevHasProRef = useRef<boolean | null>(null);
  const onUpgradeRef = useRef(onUpgrade);
  onUpgradeRef.current = onUpgrade;

  useEffect(() => {
    if (isLoading) return;
    if (prevHasProRef.current === false && hasPro) {
      onUpgradeRef.current();
      setVisible(true);
    }
    prevHasProRef.current = hasPro;
  }, [hasPro, isLoading]);

  const dismiss = useCallback(() => setVisible(false), []);

  return { visible, dismiss };
}
