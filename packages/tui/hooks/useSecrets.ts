import { extractErrorMessage } from "@repo/auth";
import { createLogger, trackError } from "@repo/logger";
import { useCallback, useRef, useState } from "react";
import { getProtectedApi } from "../api";
import type { Folder, Secret, SecretScope, SecretValueType } from "../types/models";
import { decryptSecretValue, encryptSecretValue, getProjectKey } from "../utils/crypto";
import { mapApiFolder, mapApiSecret } from "../utils/mappers";

const logger = createLogger("tui");

export interface ProjectKeySource {
  encryptedProjectKey: string;
  keyVersion: number;
}

export function isProjectKeyChangedError(error: unknown): boolean {
  return extractErrorMessage(error).toLowerCase().includes("project key changed");
}

export function useSecrets(
  projectKey: ProjectKeySource | null,
  encryptedPrivateKey: string | null,
  salt: string | null,
  onProjectKeyChanged: () => void,
) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loadedEnvironmentId, setLoadedEnvironmentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  const loadEnvironment = useCallback(async (environmentId: string) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const api = getProtectedApi();
      await api.ensureAuth();
      const data = await api.getEnvironmentData(environmentId);
      if (requestId !== requestIdRef.current) return;
      setFolders(data.folders.map(mapApiFolder));
      setSecrets(data.secrets.map(mapApiSecret));
      setLoadedEnvironmentId(environmentId);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      logger.error("Failed to load environment:", err);
      trackError("tui", err, { action: "load_environment" });
      setError(err instanceof Error ? err : new Error("Failed to load environment"));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, []);

  const clearEnvironment = useCallback(() => {
    requestIdRef.current++;
    setFolders([]);
    setSecrets([]);
    setLoadedEnvironmentId(null);
    setIsLoading(false);
    setError(null);
  }, []);

  const requireProjectKey = useCallback(async () => {
    if (!projectKey || !encryptedPrivateKey || !salt) {
      throw new Error("The project key isn't available yet. Try again in a moment.");
    }
    return {
      key: await getProjectKey(projectKey.encryptedProjectKey, encryptedPrivateKey, salt),
      keyVersion: projectKey.keyVersion,
    };
  }, [projectKey, encryptedPrivateKey, salt]);

  const decryptSecrets = useCallback(
    async (toDecrypt: Secret[]): Promise<Map<string, string>> => {
      const { key } = await requireProjectKey();
      const values = new Map<string, string>();
      await Promise.all(
        toDecrypt.map(async (secret) => {
          if (!secret.encryptedValue) return;
          try {
            values.set(secret.id, await decryptSecretValue(key, secret.encryptedValue));
          } catch (err) {
            logger.error(`Failed to decrypt secret ${secret.key}:`, err);
            trackError("tui", err, { action: "decrypt_secret" });
          }
        }),
      );
      return values;
    },
    [requireProjectKey],
  );

  const withKeyRecovery = useCallback(
    async <T>(environmentId: string, fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (isProjectKeyChangedError(err)) {
          onProjectKeyChanged();
          await loadEnvironment(environmentId);
        }
        throw err;
      }
    },
    [onProjectKeyChanged, loadEnvironment],
  );

  const createFolder = useCallback(
    async (environmentId: string, name: string) => {
      const api = getProtectedApi();
      await api.ensureAuth();
      const { id } = await api.createFolder({ environmentId, name });
      await loadEnvironment(environmentId);
      return id;
    },
    [loadEnvironment],
  );

  const updateFolder = useCallback(
    async (folderId: string, name: string) => {
      const folder = folders.find((f) => f.id === folderId);
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.updateFolder({ folderId, name });
      if (folder) await loadEnvironment(folder.environmentId);
    },
    [folders, loadEnvironment],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId);
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.deleteFolder(folderId);
      if (folder) await loadEnvironment(folder.environmentId);
    },
    [folders, loadEnvironment],
  );

  const createSecret = useCallback(
    async (args: {
      environmentId: string;
      folderId?: string;
      key: string;
      value: string;
      valueType?: SecretValueType;
      scope?: SecretScope;
    }) => {
      const id = await withKeyRecovery(args.environmentId, async () => {
        const { key, keyVersion } = await requireProjectKey();
        const encryptedValue = await encryptSecretValue(key, args.value);
        const api = getProtectedApi();
        await api.ensureAuth();
        const created = await api.createSecret({
          environmentId: args.environmentId,
          folderId: args.folderId,
          key: args.key,
          encryptedValue,
          valueType: args.valueType,
          scope: args.scope,
          expectedKeyVersion: keyVersion,
        });
        return created.id;
      });
      await loadEnvironment(args.environmentId);
      return id;
    },
    [withKeyRecovery, requireProjectKey, loadEnvironment],
  );

  const updateSecretBulk = useCallback(
    async (args: {
      environmentId: string;
      folderId?: string;
      secrets: Array<{
        secretId?: string;
        key: string;
        value: string;
        /** Plaintext the editor started with; lets unchanged values keep their ciphertext. */
        originalValue?: string;
        valueType: SecretValueType;
        scope?: SecretScope;
      }>;
      mode?: "skip" | "overwrite";
    }) => {
      const result = await withKeyRecovery(args.environmentId, async () => {
        const { key, keyVersion } = await requireProjectKey();

        const encrypted = await Promise.all(
          args.secrets.map(async (s) => {
            const existing = s.secretId ? secrets.find((e) => e.id === s.secretId) : undefined;
            const canReuse =
              existing?.encryptedValue !== undefined &&
              existing.encryptionKeyVersion === keyVersion &&
              s.originalValue !== undefined &&
              s.originalValue === s.value;
            return {
              secretId: s.secretId,
              key: s.key,
              encryptedValue:
                canReuse && existing?.encryptedValue
                  ? existing.encryptedValue
                  : await encryptSecretValue(key, s.value),
              valueType: s.valueType,
              scope: s.scope,
            };
          }),
        );

        const api = getProtectedApi();
        await api.ensureAuth();
        return await api.updateSecretBulk({
          environmentId: args.environmentId,
          folderId: args.folderId,
          secrets: encrypted,
          mode: args.mode,
          expectedKeyVersion: keyVersion,
        });
      });
      await loadEnvironment(args.environmentId);
      return result;
    },
    [withKeyRecovery, requireProjectKey, loadEnvironment, secrets],
  );

  const updateSecret = useCallback(
    async (args: {
      secretId: string;
      environmentId: string;
      key?: string;
      value?: string;
      valueType?: SecretValueType;
    }) => {
      await withKeyRecovery(args.environmentId, async () => {
        let encryptedValue: string | undefined;
        let expectedKeyVersion: number | undefined;
        if (args.value !== undefined) {
          const { key, keyVersion } = await requireProjectKey();
          encryptedValue = await encryptSecretValue(key, args.value);
          expectedKeyVersion = keyVersion;
        }
        const api = getProtectedApi();
        await api.ensureAuth();
        await api.updateSecret({
          secretId: args.secretId,
          key: args.key,
          encryptedValue,
          valueType: args.valueType,
          expectedKeyVersion,
        });
      });
      await loadEnvironment(args.environmentId);
    },
    [withKeyRecovery, requireProjectKey, loadEnvironment],
  );

  const deleteSecret = useCallback(
    async (secretId: string) => {
      const secret = secrets.find((s) => s.id === secretId);
      const api = getProtectedApi();
      await api.ensureAuth();
      await api.deleteSecret(secretId);
      if (secret) await loadEnvironment(secret.environmentId);
    },
    [secrets, loadEnvironment],
  );

  return {
    folders,
    secrets,
    loadedEnvironmentId,
    isLoading,
    error,
    loadEnvironment,
    clearEnvironment,
    decryptSecrets,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
  };
}
