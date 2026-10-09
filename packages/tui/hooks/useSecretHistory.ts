import { createLogger } from "@repo/logger";
import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import { useUserKeys } from "../convex/hooks/useUserKeys";
import type { SecretHistory } from "../types/api";
import { decryptSecretValue, getProjectKey } from "../utils/crypto";
import { buildHistoryListItems, type HistoryListItem } from "../utils/history";

const logger = createLogger("tui");

export function useSecretHistory(secretId: string | null) {
  const { encryptedPrivateKey, salt } = useUserKeys();
  const [history, setHistory] = useState<SecretHistory | null>(null);
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [values, setValues] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!secretId) return;
    setIsLoading(true);
    setError(null);
    try {
      const api = getProtectedApi();
      await api.ensureAuth();
      const result = await api.getSecretHistory(secretId);
      const listItems = buildHistoryListItems(result);

      const decrypted = new Map<number, string>();
      if (encryptedPrivateKey && salt) {
        const projectKey = await getProjectKey(
          result.encryptedProjectKey,
          encryptedPrivateKey,
          salt,
        );
        for (const item of listItems) {
          try {
            decrypted.set(item.version, await decryptSecretValue(projectKey, item.encryptedValue));
          } catch (err) {
            logger.debug(`Failed to decrypt history v${item.version}:`, err);
          }
        }
      }

      setHistory(result);
      setItems(listItems);
      setValues(decrypted);
    } catch (err) {
      logger.debug("Failed to load secret history:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [secretId, encryptedPrivateKey, salt]);

  useEffect(() => {
    if (secretId) {
      load();
    } else {
      setHistory(null);
      setItems([]);
      setValues(new Map());
      setError(null);
    }
  }, [secretId, load]);

  const restore = useCallback(
    async (version: number) => {
      if (!secretId) return;
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.restoreSecretVersion(secretId, version);
      await load();
    },
    [secretId, load],
  );

  return { history, items, values, isLoading, error, restore };
}
