import { clearSession, type Session, validateSession } from "@repo/auth";
import { useCallback, useEffect, useState } from "react";

interface UseSessionReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: Session | null;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useSession(): UseSessionReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const validation = await validateSession();
      setIsAuthenticated(validation.isValid);
      setSession(validation.session);
    } catch {
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setIsAuthenticated(false);
    setSession(null);
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return {
    isAuthenticated,
    isLoading,
    session,
    checkSession,
    logout,
  };
}
