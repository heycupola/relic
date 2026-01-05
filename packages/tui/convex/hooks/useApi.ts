import { useCallback, useState } from "react";
import { apiClient } from "../services/api";

function useApiCall<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>,
): [
  state: { data: T | null; isLoading: boolean; error: Error | null },
  execute: (...args: A) => Promise<T | null>,
] {
  const [state, setState] = useState<{ data: T | null; isLoading: boolean; error: Error | null }>({
    data: null,
    isLoading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: A): Promise<T | null> => {
      setState({ data: null, isLoading: true, error: null });
      try {
        const data = await fn(...args);
        setState({ data, isLoading: false, error: null });
        return data;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setState({ data: null, isLoading: false, error });
        return null;
      }
    },
    [fn],
  );

  return [state, execute];
}

export function useCurrentUser() {
  return useApiCall(() => apiClient.getCurrentUser());
}

export function useProjects() {
  return useApiCall(() => apiClient.listProjects());
}

export function useProject() {
  return useApiCall((projectId: string) => apiClient.getProject(projectId));
}

export function useEnvironmentData() {
  return useApiCall((environmentId: string) => apiClient.getEnvironmentData(environmentId));
}

export function useCreateProject() {
  return useApiCall((args: { name: string; encryptedProjectKey: string }) =>
    apiClient.createProject(args),
  );
}

export function useUpdateProject() {
  return useApiCall((args: { projectId: string; name: string }) => apiClient.updateProject(args));
}

export function useArchiveProject() {
  return useApiCall((projectId: string) => apiClient.archiveProject(projectId));
}

export function useUnarchiveProject() {
  return useApiCall((projectId: string) => apiClient.unarchiveProject(projectId));
}

export function useCreateEnvironment() {
  return useApiCall((args: { projectId: string; name: string; color?: string }) =>
    apiClient.createEnvironment(args),
  );
}

export function useUpdateEnvironment() {
  return useApiCall((args: { environmentId: string; name: string; color?: string }) =>
    apiClient.updateEnvironment(args),
  );
}

export function useDeleteEnvironment() {
  return useApiCall((environmentId: string) => apiClient.deleteEnvironment(environmentId));
}

export function useCreateFolder() {
  return useApiCall((args: { environmentId: string; name: string }) =>
    apiClient.createFolder(args),
  );
}

export function useUpdateFolder() {
  return useApiCall((args: { folderId: string; name: string }) => apiClient.updateFolder(args));
}

export function useDeleteFolder() {
  return useApiCall((folderId: string) => apiClient.deleteFolder(folderId));
}

export function useCreateSecret() {
  return useApiCall(
    (args: {
      environmentId: string;
      folderId?: string;
      key: string;
      encryptedValue: string;
      valueType?: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
      description?: string;
    }) => apiClient.createSecret(args),
  );
}

export function useGetSecret() {
  return useApiCall((secretId: string) => apiClient.getSecret(secretId));
}

export function useUpdateSecret() {
  return useApiCall(
    (args: {
      secretId: string;
      key?: string;
      encryptedValue?: string;
      valueType?: "string" | "number" | "boolean";
      scope?: "client" | "server" | "shared";
      description?: string;
    }) => apiClient.updateSecret(args),
  );
}

export function useDeleteSecret() {
  return useApiCall((secretId: string) => apiClient.deleteSecret(secretId));
}

export function useShareProject() {
  return useApiCall((args: { projectId: string; email: string; encryptedProjectKey: string }) =>
    apiClient.shareProject(args),
  );
}

export function useRevokeShare() {
  return useApiCall((shareId: string) => apiClient.revokeShare(shareId));
}

export function useListProjectShares() {
  return useApiCall((projectId: string) => apiClient.listProjectShares(projectId));
}

export function useHasUserKeys() {
  return useApiCall(() => apiClient.hasUserKeys());
}

export function useStoreUserKeys() {
  return useApiCall((args: { publicKey: string; encryptedPrivateKey: string; salt: string }) =>
    apiClient.storeUserKeys(args),
  );
}

export function useUpdatePassword() {
  return useApiCall((args: { encryptedPrivateKey: string; salt: string }) =>
    apiClient.updatePassword(args),
  );
}

// Pro Plan Hooks
export function useGetProPlan() {
  return useApiCall(() => apiClient.getProPlan());
}

export function useCheckProPlan() {
  return useApiCall(() => apiClient.checkProPlan());
}

// User Key Rotation Hook
export function useRotateUserKeys() {
  return useApiCall(
    (args: {
      newPublicKey: string;
      newEncryptedPrivateKey: string;
      newSalt: string;
      rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
      rewrappedOwnedProjects: Array<{ projectId: string; newEncryptedProjectKey: string }>;
    }) => apiClient.rotateUserKeys(args),
  );
}

// Shared Projects Hooks
export function useListSharedProjects() {
  return useApiCall(() => apiClient.listSharedProjects());
}

export function useGetProjectShare() {
  return useApiCall((projectId: string) => apiClient.getProjectShare(projectId));
}

// Revoke with Key Rotation Hook
export function useRevokeShareWithRotation() {
  return useApiCall(
    (args: {
      shareId: string;
      newEncryptedProjectKey: string;
      rewrappedShares: Array<{ shareId: string; newEncryptedProjectKey: string }>;
      reEncryptedSecrets: Array<{ secretId: string; newEncryptedValue: string }>;
    }) => apiClient.revokeShareWithRotation(args),
  );
}
