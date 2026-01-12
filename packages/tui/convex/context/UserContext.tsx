import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getProtectedApi } from "../api/protected";
import type { User } from "../api/types";
import { useAuth } from "./AuthContext";

interface UserContextValue {
  user: User | null;
  hasPro: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

interface UserProviderProps {
  children: ReactNode;
  pollingInterval?: number;
  onProStatusChange?: (hasPro: boolean) => void;
}

export function UserProvider({
  children,
  pollingInterval = 2000,
  onProStatusChange,
}: UserProviderProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousHasProRef = useRef<boolean | null>(null);

  const fetchUser = useCallback(async () => {
    if (!isAuthenticated) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const api = getProtectedApi();
      const userData = await api.getCurrentUser();
      setUser(userData);

      // Check if hasPro changed
      const currentHasPro = userData?.hasPro ?? false;
      if (previousHasProRef.current !== null && previousHasProRef.current !== currentHasPro) {
        onProStatusChange?.(currentHasPro);
      }
      previousHasProRef.current = currentHasPro;
    } catch {
      // Silent fail for polling - don't clear user on transient errors
      if (!isPolling) {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, onProStatusChange, isPolling]);

  // Initial fetch
  useEffect(() => {
    if (!isAuthLoading) {
      fetchUser();
    }
  }, [isAuthLoading, fetchUser]);

  // Start polling (e.g., after opening checkout link)
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    setIsPolling(true);
    pollingIntervalRef.current = setInterval(() => {
      fetchUser();
    }, pollingInterval);
  }, [fetchUser, pollingInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Auto-stop polling when user becomes pro
  useEffect(() => {
    if (user?.hasPro && isPolling) {
      stopPolling();
    }
  }, [user?.hasPro, isPolling, stopPolling]);

  return (
    <UserContext.Provider
      value={{
        user,
        hasPro: user?.hasPro ?? false,
        isLoading: isLoading || isAuthLoading,
        refetch: fetchUser,
        startPolling,
        stopPolling,
        isPolling,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
