import type { ActionLog } from "../types/api";

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function formatActionDescription(log: ActionLog): string {
  const metadata = log.metadata;

  switch (log.action) {
    case "secret.created":
      return `secret.created${metadata?.key ? ` (${metadata.key})` : ""}`;
    case "secret.updated":
      return `secret.updated${metadata?.key ? ` (${metadata.key})` : ""}`;
    case "secret.deleted":
      return `secret.deleted${metadata?.key ? ` (${metadata.key})` : ""}`;
    case "secret.exported":
      return `secret.exported${metadata?.exportCount ? ` (${metadata.exportCount} items)` : ""}`;
    case "secrets.bulk.updated":
      return `bulk.updated${metadata?.affectedValueCount ? ` (${metadata.affectedValueCount} secrets)` : ""}`;
    case "secrets.bulk_deleted":
      return `bulk.deleted${metadata?.deleteCount ? ` (${metadata.deleteCount} secrets)` : ""}`;
    case "secrets.bulk_exported":
      return `bulk.exported${metadata?.exportCount ? ` (${metadata.exportCount} secrets)` : ""}`;
    case "share.added":
      return `share.added${metadata?.sharedUserEmail ? ` (${metadata.sharedUserEmail})` : ""}`;
    case "share.revoked":
      return `share.revoked${metadata?.sharedUserEmail ? ` (${metadata.sharedUserEmail})` : ""}`;
    case "share.key_updated":
      return "share.key_updated";
    case "project.key_rotated":
      return `project.key_rotated${metadata?.secretsReEncrypted ? ` (${metadata.secretsReEncrypted} secrets)` : ""}`;
    case "user.keys_created":
      return "user.keys_created";
    case "user.password_changed":
      return "user.password_changed";
    case "keys.rotated":
      return "keys.rotated";
    default:
      return log.action;
  }
}
