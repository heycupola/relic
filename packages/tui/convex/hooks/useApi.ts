import { useCallback, useEffect, useMemo, useState } from "react";
import { getProtectedApi, type ProtectedApi } from "../api/protected";
import { ensureValidJwt } from "../services/jwt";

interface UseApiReturn {
  api: ProtectedApi | null;
  isLoading: boolean;
  error: Error | null;
  refreshApi: () => Promise<void>;
}

export function useApi(): UseApiReturn {
  const [api, setApi] = useState<ProtectedApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const initializeApi = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const jwtToken = await ensureValidJwt();
      const protectedApi = getProtectedApi(jwtToken);
      setApi(protectedApi);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to initialize API"));
      setApi(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeApi();
  }, [initializeApi]);

  return {
    api,
    isLoading,
    error,
    refreshApi: initializeApi,
  };
}

// Convenience hook for making API calls with automatic loading/error state
interface UseApiCallOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseApiCallReturn<T, Args extends unknown[]> {
  execute: (...args: Args) => Promise<T | undefined>;
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useApiCall<T, Args extends unknown[]>(
  apiCall: (api: ProtectedApi, ...args: Args) => Promise<T>,
  options: UseApiCallOptions<T> = {},
): UseApiCallReturn<T, Args> {
  const { api } = useApi();
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      if (!api) {
        setError(new Error("API not initialized"));
        return undefined;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await apiCall(api, ...args);
        setData(result);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("API call failed");
        setError(error);
        options.onError?.(error);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [api, apiCall, options],
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    execute,
    data,
    isLoading,
    error,
    reset,
  };
}
