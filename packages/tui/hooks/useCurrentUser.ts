import { useCallback, useEffect, useState } from "react";
import { getProtectedApi } from "../api";
import type { User } from "../types/api";
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
  const [user, setUser] = useState<User | null>(null);
  const [hasKeys, setHasKeys] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const api = getProtectedApi();
      await api.ensureAuth();
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
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const displayName = user ? getUserDisplayName(user) : "User";

  return {
    user,
    displayName,
    isLoading,
    error,
    refetch: fetchUser,
    hasKeys,
    hasPro: user?.hasPro ?? false,
  };
}
