import { useCallback, useState } from "react";
import { getProtectedApi } from "../api";

export function useApi() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async <T>(fn: (api: ReturnType<typeof getProtectedApi>) => Promise<T>): Promise<T | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        const result = await fn(api);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("API call failed");
        setError(error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { execute, isLoading, error };
}
