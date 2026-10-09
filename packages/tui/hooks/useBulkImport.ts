import { createLogger, trackEvent } from "@repo/logger";
import { useMemo, useState } from "react";
import type { Key } from "../types/keyboard";
import type { Secret, SecretScope, SecretValueType } from "../types/models";
import {
  type BulkImportFormat,
  type CollisionInfo,
  computeRemovedKeys,
  envToJson,
  jsonToEnv,
  parseEnvContent,
  validateBulkImportJson,
} from "../utils/bulkImport";
import { type ProjectItem, type ProjectLocation, secretsInView } from "../utils/projectItems";
import { useMultiLineInput } from "./useInput";
import { usePaste } from "./usePaste";
import { useTaskQueue } from "./useTaskQueue";

const logger = createLogger("tui");

const EMPTY_TEMPLATE = "# Add your secrets here\nAPI_KEY=your_key_here";

type SecretItem = Extract<ProjectItem, { type: "secret" }>;

interface UseBulkImportOptions {
  visible: boolean;
  location: ProjectLocation;
  allSecrets: Secret[];
  onClose: () => void;
  updateSecretBulk: (args: {
    environmentId: string;
    folderId?: string;
    secrets: Array<{
      secretId?: string;
      key: string;
      value: string;
      valueType: SecretValueType;
      scope?: SecretScope;
    }>;
    mode?: "skip" | "overwrite";
  }) => Promise<unknown>;
  deleteSecret: (secretId: string) => Promise<void>;
}

function parseContent(content: string, format: BulkImportFormat) {
  return validateBulkImportJson(format === "env" ? parseEnvContent(content) : JSON.parse(content));
}

export function useBulkImport({
  visible,
  location,
  allSecrets,
  onClose,
  updateSecretBulk,
  deleteSecret,
}: UseBulkImportOptions) {
  const { attemptTask, showSuccess } = useTaskQueue();
  const input = useMultiLineInput({ maxLines: 50 });
  const [format, setFormat] = useState<BulkImportFormat>("env");
  const [scopes, setScopes] = useState<Map<string, string>>(new Map());

  const collisions = useMemo<CollisionInfo[]>(() => {
    const trimmed = input.value.trim();
    if (!visible || !trimmed) return [];
    try {
      const result = parseContent(trimmed, format);
      if (!result.valid) return [];
      return result.secrets.flatMap((s) => {
        const existing = allSecrets.find((e) => e.key === s.key);
        return existing ? [{ key: s.key, existingSecretId: existing.id }] : [];
      });
    } catch {
      return [];
    }
  }, [visible, input.value, format, allSecrets]);

  usePaste((text) => {
    if (visible) input.handlePaste(text);
  });

  const open = (secretItems: SecretItem[]) => {
    if (secretItems.length === 0) {
      input.setValue(EMPTY_TEMPLATE);
      setScopes(new Map());
    } else {
      setScopes(new Map(secretItems.map((s) => [s.name, s.secretScope])));
      const secretsJson = JSON.stringify(
        secretItems.map((s) => ({
          key: s.name,
          value: s.value,
          type: s.secretType,
          scope: s.secretScope,
        })),
      );
      input.setValue(jsonToEnv(secretsJson) || "");
    }
    setFormat("env");
  };

  const close = () => {
    onClose();
    input.reset();
  };

  const toggleFormat = () => {
    const content = input.value.trim();
    if (!content) return;

    if (format === "env") {
      const json = envToJson(content, scopes);
      if (json && json !== "[]") {
        input.setValue(json);
        setFormat("json");
      }
      return;
    }

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const updatedScopes = new Map(scopes);
        for (const item of parsed) {
          if (item?.key && item?.scope) updatedScopes.set(item.key, item.scope);
        }
        setScopes(updatedScopes);
      }
    } catch {
      // Invalid JSON keeps the previous scopes
    }
    const env = jsonToEnv(content);
    if (env) {
      input.setValue(env);
      setFormat("env");
    }
  };

  const save = async () => {
    const trimmed = input.value.trim();
    const { environmentId } = location;
    if (!trimmed || !environmentId) return;

    let result: ReturnType<typeof parseContent>;
    try {
      result = parseContent(trimmed, format);
    } catch (error) {
      logger.debug("Bulk import parse failed:", error);
      return;
    }
    if (!result.valid || result.secrets.length === 0) return;

    const { secrets } = result;
    const scopeSecrets = secretsInView(allSecrets, location);
    const keyToSecretId = new Map(scopeSecrets.map((s) => [s.key, s.id]));
    const removedKeys = computeRemovedKeys(
      scopeSecrets.map((s) => s.key),
      secrets.map((s) => s.key),
    );

    const saved = await attemptTask(`Saving ${secrets.length} secrets...`, async () => {
      await updateSecretBulk({
        environmentId,
        folderId: location.viewLevel === "folder" ? location.folderId || undefined : undefined,
        secrets: secrets.map((s) => ({
          secretId: s.secretId || keyToSecretId.get(s.key),
          key: s.key,
          value: String(s.value),
          valueType: s.type,
          scope: (s.scope || scopes.get(s.key) || "shared") as SecretScope,
        })),
        mode: "overwrite",
      });

      for (const key of removedKeys) {
        const secretId = keyToSecretId.get(key);
        if (secretId) await deleteSecret(secretId);
      }
    });

    if (!saved) {
      trackEvent("bulk_import_completed", { success: false });
      return;
    }

    trackEvent("bulk_import_completed", {
      count: secrets.length,
      deleted: removedKeys.length,
      success: true,
    });
    showSuccess(
      removedKeys.length > 0
        ? `${secrets.length} secrets saved, ${removedKeys.length} removed`
        : `${secrets.length} secrets saved`,
    );
    close();
  };

  const handleKey = (key: Key) => {
    if (key.name === "escape") close();
    else if (key.name === "j" && key.meta) toggleFormat();
    else if ((key.name === "s" || key.name === "return") && key.meta) void save();
    else input.handleKey(key);
  };

  return {
    open,
    close,
    handleKey,
    content: input.value,
    cursor: input.cursor,
    format,
    collisions,
  };
}
