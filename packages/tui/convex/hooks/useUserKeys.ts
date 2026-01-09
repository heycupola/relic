import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../../utils/debugLog";
import { clearMasterKeyCache } from "../../utils/masterKeyCache";
import { useApi } from "./useApi";

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
  const { api, isLoading: isApiLoading, error: apiError } = useApi();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState<string | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStoring, setIsStoring] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store the latest onError callback in a ref to avoid including options in dependency arrays
  const onErrorRef = useRef<((error: Error) => void) | undefined>(options?.onError);
  useEffect(() => {
    onErrorRef.current = options?.onError;
  }, [options?.onError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchUserKeys = useCallback(async () => {
    if (!api) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
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
  }, [api]);

  const checkHasKeys = useCallback(async (): Promise<boolean> => {
    if (!api) {
      return false;
    }

    try {
      return await api.hasUserKeys();
    } catch (err) {
      logger.error("Failed to check if user has keys:", err);
      const error = err instanceof Error ? err : new Error("Failed to check if user has keys");
      setError(error);
      onErrorRef.current?.(error);
      return false;
    }
  }, [api]);

  const storeUserKeys = useCallback(
    async (args: { publicKey: string; encryptedPrivateKey: string; salt: string }) => {
      if (!api) {
        const error = new Error("API not initialized");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      }

      setIsStoring(true);
      setError(null);

      try {
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
    [api],
  );

  const updatePassword = useCallback(
    async (args: { encryptedPrivateKey: string; salt: string }) => {
      if (!api) {
        const error = new Error("API not initialized");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      }

      setIsUpdating(true);
      setError(null);

      try {
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
    [api],
  );

  const rotateUserKeys = useCallback(
    async (args: {
      newPublicKey: string;
      newEncryptedPrivateKey: string;
      newSalt: string;
      rewrappedShares?: Array<{ shareId: string; newEncryptedProjectKey: string }>;
      rewrappedOwnedProjects?: Array<{ projectId: string; newEncryptedProjectKey: string }>;
    }) => {
      if (!api) {
        const error = new Error("API not initialized");
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      }

      setIsRotating(true);
      setError(null);

      try {
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
    [api],
  );

  useEffect(() => {
    if (api && !isApiLoading) {
      fetchUserKeys();
    }
  }, [api, isApiLoading, fetchUserKeys]);

  const hasKeys = publicKey !== null && encryptedPrivateKey !== null && salt !== null;

  return {
    publicKey,
    encryptedPrivateKey,
    salt,
    hasKeys,
    isLoading: isLoading || isApiLoading,
    isStoring,
    isUpdating,
    isRotating,
    error: error || apiError,
    refetch: fetchUserKeys,
    storeUserKeys,
    updatePassword,
    rotateUserKeys,
    checkHasKeys,
    clearError,
  };
}
