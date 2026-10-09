import { createLogger, trackEvent } from "@repo/logger";
import { useMemo, useRef, useState } from "react";
import type { Key } from "../types/keyboard";
import type { Secret, SecretScope, SecretValueType } from "../types/models";
import {
  type BulkImportFormat,
  type CollisionInfo,
  computeRemovedKeys,
  envToJson,
  findCollisions,
  jsonToEnv,
  parseEnvContent,
  validateBulkImportJson,
} from "../utils/bulkImport";
import { type ProjectLocation, secretsInView } from "../utils/projectItems";
import { useMultiLineInput } from "./useInput";
import { usePaste } from "./usePaste";
import { useTaskQueue } from "./useTaskQueue";

const logger = createLogger("tui");

const EMPTY_TEMPLATE = "# Add your secrets here\nAPI_KEY=your_key_here";

interface OriginalSecret {
  secretId: string;
  value: string;
  type: SecretValueType;
  scope: SecretScope;
}

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
      originalValue?: string;
      valueType: SecretValueType;
      scope?: SecretScope;
    }>;
    mode?: "skip" | "overwrite";
  }) => Promise<unknown>;
  deleteSecret: (secretId: string) => Promise<void>;
}

function parseContent(
  content: string,
  format: BulkImportFormat,
  knownTypes: ReadonlyMap<string, SecretValueType>,
) {
  return validateBulkImportJson(
    format === "env" ? parseEnvContent(content, knownTypes) : JSON.parse(content),
  );
}

export function isSaveKey(key: Key): boolean {
  return (key.name === "s" && (key.ctrl || key.meta)) || (key.name === "return" && key.meta);
}

export function isToggleFormatKey(key: Key): boolean {
  return (key.name === "t" && key.ctrl) || (key.name === "j" && key.meta);
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
  const [types, setTypes] = useState<Map<string, SecretValueType>>(new Map());
  const [originals, setOriginals] = useState<Map<string, OriginalSecret>>(new Map());
  const savingRef = useRef(false);

  const collisions = useMemo<CollisionInfo[]>(() => {
    const trimmed = input.value.trim();
    if (!visible || !trimmed) return [];
    try {
      const result = parseContent(trimmed, format, types);
      if (!result.valid) return [];
      const prefilledIds = new Set([...originals.values()].map((o) => o.secretId));
      return findCollisions(
        result.secrets.map((s) => s.key),
        secretsInView(allSecrets, location),
        prefilledIds,
      );
    } catch {
      return [];
    }
  }, [visible, input.value, format, types, originals, allSecrets, location]);

  usePaste((text) => {
    if (visible) input.handlePaste(text);
  });

  const open = (secrets: Secret[], values: ReadonlyMap<string, string>) => {
    const loaded = new Map<string, OriginalSecret>();
    for (const s of secrets) {
      const value = values.get(s.id);
      if (value === undefined) continue;
      loaded.set(s.key, {
        secretId: s.id,
        value,
        type: s.type ?? "string",
        scope: s.scope ?? "shared",
      });
    }
    setOriginals(loaded);
    setScopes(new Map([...loaded].map(([key, o]) => [key, o.scope])));
    setTypes(new Map([...loaded].map(([key, o]) => [key, o.type])));

    if (loaded.size === 0) {
      input.setValue(EMPTY_TEMPLATE);
    } else {
      const secretsJson = JSON.stringify(
        [...loaded].map(([key, o]) => ({ key, value: o.value, type: o.type, scope: o.scope })),
      );
      input.setValue(jsonToEnv(secretsJson) || "");
    }
    input.setCursor({ line: 0, column: 0 });
    setFormat("env");
  };

  const close = () => {
    onClose();
    input.reset();
    setOriginals(new Map());
    setScopes(new Map());
    setTypes(new Map());
  };

  const toggleFormat = () => {
    const content = input.value.trim();
    if (!content) return;

    if (format === "env") {
      const json = envToJson(content, scopes, types);
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
        const updatedTypes = new Map(types);
        for (const item of parsed) {
          if (item?.key && item?.scope) updatedScopes.set(item.key, item.scope);
          if (item?.key && ["string", "number", "boolean"].includes(item?.type)) {
            updatedTypes.set(item.key, item.type);
          }
        }
        setScopes(updatedScopes);
        setTypes(updatedTypes);
      }
    } catch {
      // Invalid JSON keeps the previous scopes and types
    }
    const env = jsonToEnv(content);
    if (env) {
      input.setValue(env);
      setFormat("env");
    }
  };

  const save = async () => {
    if (savingRef.current) return;
    const trimmed = input.value.trim();
    const { environmentId } = location;
    if (!trimmed || !environmentId) return;

    let result: ReturnType<typeof parseContent>;
    try {
      result = parseContent(trimmed, format, types);
    } catch (error) {
      logger.debug("Bulk import parse failed:", error);
      return;
    }
    if (!result.valid || result.secrets.length === 0) return;

    const { secrets } = result;
    const keyToSecretId = new Map(secretsInView(allSecrets, location).map((s) => [s.key, s.id]));
    const removedKeys = computeRemovedKeys(
      [...originals.keys()],
      secrets.map((s) => s.key),
    );

    savingRef.current = true;
    try {
      const saved = await attemptTask(`Saving ${secrets.length} secrets...`, async () => {
        await updateSecretBulk({
          environmentId,
          folderId: location.viewLevel === "folder" ? location.folderId || undefined : undefined,
          secrets: secrets.map((s) => {
            const original = originals.get(s.key);
            const secretId = s.secretId || original?.secretId || keyToSecretId.get(s.key);
            return {
              secretId,
              key: s.key,
              value: String(s.value),
              originalValue:
                original && original.secretId === secretId ? original.value : undefined,
              valueType: s.type,
              scope: (s.scope || scopes.get(s.key) || "shared") as SecretScope,
            };
          }),
          mode: "overwrite",
        });

        for (const key of removedKeys) {
          const secretId = originals.get(key)?.secretId;
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
    } finally {
      savingRef.current = false;
    }
  };

  const handleKey = (key: Key) => {
    if (key.name === "escape") close();
    else if (isToggleFormatKey(key)) toggleFormat();
    else if (isSaveKey(key)) void save();
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
