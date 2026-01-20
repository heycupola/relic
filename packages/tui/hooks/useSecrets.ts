import { useCallback, useState } from "react";
import { getProtectedApi } from "../api";
import type { Secret as ApiSecret } from "../types/api";
import type { Folder, Secret } from "../types/models";
import { decryptSecretValue, encryptSecretValue, getProjectKey } from "../utils/crypto";
import { logger } from "../utils/debugLog";
import { mapApiFolder, mapApiSecret } from "../utils/mappers";

export function useSecrets(
  _projectId: string,
  encryptedProjectKeySource: string | null,
  encryptedPrivateKey: string | null,
  salt: string | null,
) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadEnvironment = useCallback(
    async (environmentId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const api = getProtectedApi();
        await api.ensureAuth();
        const data = await api.getEnvironmentData(environmentId);

        setFolders(data.folders.map(mapApiFolder));
        const projectKey =
          encryptedProjectKeySource && encryptedPrivateKey && salt
            ? await getProjectKey(encryptedProjectKeySource, encryptedPrivateKey, salt)
            : null;

        const decrypted = await Promise.all(
          data.secrets.map(async (s: ApiSecret) => {
            const mapped = mapApiSecret(s);
            if (projectKey && s.encryptedValue) {
              try {
                mapped.value = await decryptSecretValue(projectKey, s.encryptedValue);
              } catch (err) {
                logger.error(`Failed to decrypt secret ${mapped.key}:`, err);
              }
            }
            return mapped;
          }),
        );

        setSecrets(decrypted);
      } catch (err) {
        logger.error("Failed to load environment:", err);
        setError(err instanceof Error ? err : new Error("Failed to load environment"));
      } finally {
        setIsLoading(false);
      }
    },
    [encryptedProjectKeySource, encryptedPrivateKey, salt],
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
      valueType?: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
    }) => {
      if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
        throw new Error("Cannot encrypt: No project key available");
      }

      const projectKey = await getProjectKey(encryptedProjectKeySource, encryptedPrivateKey, salt);
      const encryptedValue = await encryptSecretValue(projectKey, args.value);

      const api = getProtectedApi();
      await api.ensureAuth();
      const { id } = await api.createSecret({
        environmentId: args.environmentId,
        folderId: args.folderId,
        key: args.key,
        encryptedValue,
        valueType: args.valueType,
        scope: args.scope,
      });
      await loadEnvironment(args.environmentId);
      return id;
    },
    [encryptedProjectKeySource, encryptedPrivateKey, salt, loadEnvironment],
  );

  const updateSecretBulk = useCallback(
    async (args: {
      environmentId: string;
      folderId?: string;
      secrets: Array<{
        secretId?: string;
        key: string;
        value: string;
        valueType: "string" | "number" | "boolean";
        scope?: "client" | "server" | "shared";
      }>;
      mode?: "skip" | "overwrite";
    }) => {
      if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
        throw new Error("Cannot encrypt: No project key available");
      }

      const projectKey = await getProjectKey(encryptedProjectKeySource, encryptedPrivateKey, salt);

      // Optimize: only re-encrypt if value actually changed
      const encrypted = await Promise.all(
        args.secrets.map(async (s) => {
          // Find existing secret by ID or key
          const existingSecret = s.secretId
            ? secrets.find((existing) => existing.id === s.secretId)
            : secrets.find(
                (existing) =>
                  existing.key === s.key &&
                  existing.environmentId === args.environmentId &&
                  existing.folderId === args.folderId,
              );

          // If secret exists and value hasn't changed, reuse encrypted value from state
          if (existingSecret && existingSecret.value === s.value && existingSecret.encryptedValue) {
            return {
              secretId: s.secretId,
              key: s.key,
              encryptedValue: existingSecret.encryptedValue,
              valueType: s.valueType,
              scope: s.scope,
            };
          }

          // Otherwise, encrypt the new/changed value
          return {
            secretId: s.secretId,
            key: s.key,
            encryptedValue: await encryptSecretValue(projectKey, s.value),
            valueType: s.valueType,
            scope: s.scope,
          };
        }),
      );

      const api = getProtectedApi();
      await api.ensureAuth();
      const payload = {
        environmentId: args.environmentId,
        folderId: args.folderId,
        secrets: encrypted,
        mode: args.mode,
      };

      const result = await api.updateSecretBulk(payload);
      await loadEnvironment(args.environmentId);
      return result;
    },
    [encryptedProjectKeySource, encryptedPrivateKey, salt, loadEnvironment, secrets],
  );

  const updateSecret = useCallback(
    async (args: {
      secretId: string;
      environmentId: string;
      key?: string;
      value?: string;
      valueType?: "string" | "number" | "boolean";
    }) => {
      let encryptedValue: string | undefined;
      if (args.value) {
        if (!encryptedProjectKeySource || !encryptedPrivateKey || !salt) {
          throw new Error("Cannot encrypt: No project key available");
        }
        const projectKey = await getProjectKey(
          encryptedProjectKeySource,
          encryptedPrivateKey,
          salt,
        );
        encryptedValue = await encryptSecretValue(projectKey, args.value);
      }

      const api = getProtectedApi();
      await api.ensureAuth();
      await api.updateSecret({
        secretId: args.secretId,
        key: args.key,
        encryptedValue,
        valueType: args.valueType,
      });
      await loadEnvironment(args.environmentId);
    },
    [encryptedProjectKeySource, encryptedPrivateKey, salt, loadEnvironment],
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
    isLoading,
    error,
    loadEnvironment,
    createFolder,
    updateFolder,
    deleteFolder,
    createSecret,
    updateSecret,
    updateSecretBulk,
    deleteSecret,
  };
}
