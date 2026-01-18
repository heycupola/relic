import { useCallback, useState } from "react";

type LoadingFlags = Record<string, boolean>;

export function useLoadingState<T extends string>(flags: readonly T[] = [] as readonly T[]) {
  const [loading, setLoading] = useState<LoadingFlags>(() =>
    Object.fromEntries(flags.map((flag) => [flag, false])),
  );

  const start = useCallback((flag: T) => {
    setLoading((prev) => ({ ...prev, [flag]: true }));
  }, []);

  const stop = useCallback((flag: T) => {
    setLoading((prev) => ({ ...prev, [flag]: false }));
  }, []);

  const run = useCallback(
    async <R>(flag: T, fn: () => Promise<R>): Promise<R | undefined> => {
      if (loading[flag]) return undefined;
      start(flag);
      try {
        return await fn();
      } finally {
        stop(flag);
      }
    },
    [loading, start, stop],
  );

  const isLoading = useCallback((flag: T) => loading[flag] || false, [loading]);

  const anyLoading = useCallback(() => Object.values(loading).some(Boolean), [loading]);

  return {
    isLoading,
    anyLoading,
    start,
    stop,
    run,
    flags: loading,
  };
}
