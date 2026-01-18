import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getProtectedApi } from "./api";
import { clearSession, validateSession } from "./convex/services/session";
import type { Session } from "./convex/types";
import type { User } from "./types/api";

interface AppContextValue {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  session: Session | null;
  logout: () => Promise<void>;
  user: User | null;
  isUserLoading: boolean;
  hasPro: boolean;
  refreshUser: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  pollingInterval?: number;
  onProStatusChange?: (hasPro: boolean) => void;
}

export function AppProvider({
  children,
  pollingInterval = 2000,
  onProStatusChange,
}: AppProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousHasProRef = useRef<boolean | null>(null);

  const validateAuth = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      const validation = await validateSession();
      setIsAuthenticated(validation.isValid);
      setSession(validation.session);
    } catch {
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    if (!isAuthenticated) {
      setUser(null);
      setIsUserLoading(false);
      return;
    }

    try {
      const api = getProtectedApi();
      const userData = await api.getCurrentUser();
      setUser(userData);

      const currentHasPro = userData?.hasPro ?? false;
      if (previousHasProRef.current !== null && previousHasProRef.current !== currentHasPro) {
        onProStatusChange?.(currentHasPro);
      }
      previousHasProRef.current = currentHasPro;
    } catch {
      if (!isPolling) setUser(null);
    } finally {
      setIsUserLoading(false);
    }
  }, [isAuthenticated, onProStatusChange, isPolling]);

  const logout = useCallback(async () => {
    await clearSession();
    setIsAuthenticated(false);
    setSession(null);
    setUser(null);
  }, []);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(fetchUser, pollingInterval);
  }, [fetchUser, pollingInterval]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    validateAuth();
  }, [validateAuth]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchUser();
    }
  }, [isAuthLoading, fetchUser]);

  useEffect(() => {
    if (user?.hasPro && isPolling) {
      stopPolling();
    }
  }, [user?.hasPro, isPolling, stopPolling]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        session,
        logout,
        user,
        isUserLoading,
        hasPro: user?.hasPro ?? false,
        refreshUser: fetchUser,
        startPolling,
        stopPolling,
        isPolling,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}

export function useAuth() {
  const context = useApp();
  const refreshAuth = useCallback(async () => {
    const { validateSession } = await import("./convex/services/session");
    const validation = await validateSession();
    return validation;
  }, []);

  return {
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isAuthLoading,
    session: context.session,
    logout: context.logout,
    refreshAuth,
  };
}

export function useUser() {
  const { user, isUserLoading, hasPro, refreshUser, startPolling, stopPolling, isPolling } =
    useApp();
  return {
    user,
    isLoading: isUserLoading,
    hasPro,
    refetch: refreshUser,
    startPolling,
    stopPolling,
    isPolling,
  };
}
