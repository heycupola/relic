import { decryptSecret, encryptSecret } from "@repo/crypto";
import type { SecretHistory, SecretHistoryForRotation } from "../types/api";

export interface HistoryListItem {
  version: number;
  isCurrent: boolean;
  label: string;
  changedAt: number;
  changedBy: string;
  encryptedValue: string;
}

export function buildHistoryListItems(history: SecretHistory): HistoryListItem[] {
  const items: HistoryListItem[] = [];

  if (!history.isDeleted && history.currentVersion !== null && history.encryptedValue) {
    items.push({
      version: history.currentVersion,
      isCurrent: true,
      label: "current",
      changedAt: history.updatedAt,
      changedBy: history.updatedByEmail ?? "unknown",
      encryptedValue: history.encryptedValue,
    });
  }

  for (const entry of history.versions) {
    items.push({
      version: entry.version,
      isCurrent: false,
      label: entry.changeType,
      changedAt: entry.changedAt,
      changedBy: entry.changedByEmail ?? entry.changedBy,
      encryptedValue: entry.encryptedValue,
    });
  }

  return items;
}

export function formatHistoryTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return new Date(timestamp).toISOString().slice(0, 10);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/**
 * Entries that don't decrypt with the current key are skipped; the server purges
 * anything left on a retired key version after rotation.
 */
export async function reEncryptHistoryEntries(
  entries: SecretHistoryForRotation[],
  currentProjectKey: CryptoKey,
  newProjectKey: CryptoKey,
): Promise<Array<{ historyId: string; newEncryptedValue: string }>> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const plaintext = await decryptSecret(currentProjectKey, entry.encryptedValue);
        return {
          historyId: entry.id,
          newEncryptedValue: await encryptSecret(newProjectKey, plaintext),
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((result) => result !== null);
}
