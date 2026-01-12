import { useCallback, useEffect, useState } from "react";
import type { User } from "../convex/api/types";
import { useApi } from "../convex/hooks/useApi";
import { getUserDisplayName } from "../utils/mappers";

interface UseCurrentUserReturn {
  user: User | null;
  displayName: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  hasKeys: boolean;
  hasPro: boolean;
}

export function useCurrentUser(): UseCurrentUserReturn {
  const { api, isLoading: isApiLoading, error: apiError } = useApi();
  const [user, setUser] = useState<User | null>(null);
  const [hasKeys, setHasKeys] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      const [currentUser, userHasKeys] = await Promise.all([
        api.getCurrentUser(),
        api.hasUserKeys(),
      ]);
      setUser(currentUser);
      setHasKeys(userHasKeys);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch user"));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (api && !isApiLoading) {
      fetchUser();
    }
  }, [api, isApiLoading, fetchUser]);

  const displayName = user ? getUserDisplayName(user) : "User";

  return {
    user,
    displayName,
    isLoading: isLoading || isApiLoading,
    error: error || apiError,
    refetch: fetchUser,
    hasKeys,
    hasPro: user?.hasPro ?? false,
  };
}
