import { useCallback, useEffect, useRef, useState } from "react";
import { getProtectedApi } from "../../api";
import { clearMasterKeyCache } from "../../utils/crypto";
import { logger } from "../../utils/debugLog";

interface UseUserKeysOptions {
  onError?: (error: Error) => void;
}

interface UseUserKeysReturn {
  publicKey: string | null;
  encryptedPrivateKey: string | null;
  salt: string | null;
  hasKeys: boolean;
  isLoading: boolean;
  isStoring: boolean;
  isUpdating: boolean;
  isRotating: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  storeUserKeys: (args: {
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
  }) => Promise<void>;
  updatePassword: (args: { encryptedPrivateKey: string; salt: string }) => Promise<void>;
  rotateUserKeys: (args: {
    newPublicKey: string;
    newEncryptedPrivateKey: string;
    newSalt: string;
    rewrappedShares?: Array<{ shareId: string; newEncryptedProjectKey: string }>;
    rewrappedOwnedProjects?: Array<{ projectId: string; newEncryptedProjectKey: string }>;
  }) => Promise<void>;
  checkHasKeys: () => Promise<boolean>;
  clearError: () => void;
}

export function useUserKeys(options?: UseUserKeysOptions): UseUserKeysReturn {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState<string | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStoring, setIsStoring] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const onErrorRef = useRef<((error: Error) => void) | undefined>(options?.onError);
  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchUserKeys = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const api = getProtectedApi();
      await api.ensureAuth();
      const user = await api.getCurrentUser();
      setPublicKey(user.publicKey ?? null);
      setEncryptedPrivateKey(user.encryptedPrivateKey ?? null);
      setSalt(user.salt ?? null);
    } catch (err) {
      logger.error("Failed to fetch user keys:", err);
      const error = err instanceof Error ? err : new Error("Failed to fetch user keys");
      setError(error);
      onErrorRef.current?.(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkHasKeys = useCallback(async (): Promise<boolean> => {
    try {
      const api = getProtectedApi();
      await api.ensureAuth();
      return await api.hasUserKeys();
    } catch (err) {
      logger.error("Failed to check if user has keys:", err);
      const error = err instanceof Error ? err : new Error("Failed to check if user has keys");
      setError(error);
      onErrorRef.current?.(error);
      return false;
    }
  }, []);

  const storeUserKeys = useCallback(
    async (args: { publicKey: string; encryptedPrivateKey: string; salt: string }) => {
      setIsStoring(true);
      setError(null);

      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        await api.storeUserKeys(args);
        setPublicKey(args.publicKey);
        setEncryptedPrivateKey(args.encryptedPrivateKey);
        setSalt(args.salt);
      } catch (err) {
        logger.error("Failed to store user keys:", err);
        const error = err instanceof Error ? err : new Error("Failed to store user keys");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsStoring(false);
      }
    },
    [],
  );

  const updatePassword = useCallback(
    async (args: { encryptedPrivateKey: string; salt: string }) => {
      setIsUpdating(true);
      setError(null);

      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        await api.updatePassword(args);
        setEncryptedPrivateKey(args.encryptedPrivateKey);
        setSalt(args.salt);
      } catch (err) {
        logger.error("Failed to update password:", err);
        const error = err instanceof Error ? err : new Error("Failed to update password");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  const rotateUserKeys = useCallback(
    async (args: {
      newPublicKey: string;
      newEncryptedPrivateKey: string;
      newSalt: string;
      rewrappedShares?: Array<{ shareId: string; newEncryptedProjectKey: string }>;
      rewrappedOwnedProjects?: Array<{ projectId: string; newEncryptedProjectKey: string }>;
    }) => {
      setIsRotating(true);
      setError(null);

      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        await api.rotateUserKeys({
          newPublicKey: args.newPublicKey,
          newEncryptedPrivateKey: args.newEncryptedPrivateKey,
          newSalt: args.newSalt,
          rewrappedShares: args.rewrappedShares ?? [],
          rewrappedOwnedProjects: args.rewrappedOwnedProjects ?? [],
        });
        setPublicKey(args.newPublicKey);
        setEncryptedPrivateKey(args.newEncryptedPrivateKey);
        setSalt(args.newSalt);
        clearMasterKeyCache();
      } catch (err) {
        logger.error("Failed to rotate user keys:", err);
        const error = err instanceof Error ? err : new Error("Failed to rotate user keys");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsRotating(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchUserKeys();
  }, [fetchUserKeys]);

  const hasKeys = publicKey !== null && encryptedPrivateKey !== null && salt !== null;

  return {
    publicKey,
    encryptedPrivateKey,
    salt,
    hasKeys,
    isLoading,
    isStoring,
    isUpdating,
    isRotating,
    error,
    refetch: fetchUserKeys,
    storeUserKeys,
    updatePassword,
    rotateUserKeys,
    checkHasKeys,
    clearError,
  };
}
