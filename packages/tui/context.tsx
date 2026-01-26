import { clearSession, type Session, validateSession } from "@repo/auth";
import { api } from "@repo/backend";
import { useQuery } from "convex/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
  onProStatusChange?: (hasPro: boolean) => void;
}

export function AppProvider({ children, onProStatusChange }: AppProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const previousHasProRef = useRef<boolean | null>(null);

  const convexUser = useQuery(api.user.getCurrentUser);
  const user = convexUser as User | null | undefined;
  const isUserLoading = convexUser === undefined;

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

  const logout = useCallback(async () => {
    await clearSession();
    setIsAuthenticated(false);
    setSession(null);
  }, []);

  useEffect(() => {
    const currentHasPro = user?.hasPro ?? false;
    if (previousHasProRef.current !== null && previousHasProRef.current !== currentHasPro) {
      onProStatusChange?.(currentHasPro);
    }
    previousHasProRef.current = currentHasPro;
  }, [user?.hasPro, onProStatusChange]);

  useEffect(() => {
    validateAuth();
  }, [validateAuth]);

  const refreshUser = useCallback(async () => {
    // Placeholder for future implementation - user data is automatically refreshed by Convex
  }, []);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        session,
        logout,
        user: user ?? null,
        isUserLoading,
        hasPro: user?.hasPro ?? false,
        refreshUser,
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
  const { user, isUserLoading, hasPro, refreshUser } = useApp();
  return {
    user,
    isLoading: isUserLoading,
    hasPro,
    refetch: refreshUser,
  };
}
