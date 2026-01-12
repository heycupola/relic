import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { getProtectedApi } from "../api/protected";
import { useAuth } from "./AuthContext";

interface UserPlanContextValue {
  hasPro: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const UserPlanContext = createContext<UserPlanContextValue | null>(null);

interface UserPlanProviderProps {
  children: ReactNode;
}

export function UserPlanProvider({ children }: UserPlanProviderProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [hasPro, setHasPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!isAuthenticated) {
      setHasPro(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const api = getProtectedApi();
      const result = await api.checkProPlan();
      setHasPro(result.hasPro);
    } catch {
      setHasPro(false);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchPlan();
    }
  }, [isAuthLoading, fetchPlan]);

  return (
    <UserPlanContext.Provider
      value={{
        hasPro,
        isLoading: isLoading || isAuthLoading,
        refetch: fetchPlan,
      }}
    >
      {children}
    </UserPlanContext.Provider>
  );
}

export function useUserPlan(): UserPlanContextValue {
  const context = useContext(UserPlanContext);
  if (!context) {
    throw new Error("useUserPlan must be used within a UserPlanProvider");
  }
  return context;
}
