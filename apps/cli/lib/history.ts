import pc from "picocolors";
import type { SecretHistory } from "./api";

export const MASKED_VALUE = "********";

export interface HistoryRow {
  version: number | null;
  current: boolean;
  changeType: "current" | "deleted" | "updated" | "restored";
  changedAt: number;
  changedBy: string;
  encryptedValue: string | null;
}

export function buildHistoryRows(history: SecretHistory): HistoryRow[] {
  const rows: HistoryRow[] = [];

  if (!history.secret.isDeleted) {
    rows.push({
      version: history.secret.currentVersion,
      current: true,
      changeType: "current",
      changedAt: history.secret.updatedAt,
      changedBy: history.secret.updatedByEmail ?? history.secret.updatedBy,
      encryptedValue: history.secret.encryptedValue,
    });
  }

  for (const entry of history.versions) {
    rows.push({
      version: entry.version,
      current: false,
      changeType: entry.changeType,
      changedAt: entry.changedAt,
      changedBy: entry.changedByEmail ?? entry.changedBy,
      encryptedValue: entry.encryptedValue,
    });
  }

  return rows;
}

export function parseVersion(input: string): number | null {
  const match = /^v?(\d+)$/i.exec(input.trim());
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return new Date(timestamp).toISOString().slice(0, 10);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function renderHistoryTable(
  rows: HistoryRow[],
  values: Map<number, string> | null,
  now = Date.now(),
): string[] {
  const header = ["VERSION", "CHANGE", "WHEN", "BY", "VALUE"];
  const body = rows.map((row) => [
    row.version === null ? "-" : `v${row.version}`,
    row.changeType,
    formatRelativeTime(row.changedAt, now),
    truncate(row.changedBy, 32),
    values && row.version !== null
      ? truncate(values.get(row.version) ?? "", 48)
      : row.encryptedValue
        ? MASKED_VALUE
        : "-",
  ]);

  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((cells) => cells[column]!.length)),
  );
  const format = (cells: string[]) =>
    cells
      .map((cell, column) => (column === cells.length - 1 ? cell : cell.padEnd(widths[column]!)))
      .join("  ");

  return [
    pc.dim(format(header)),
    ...body.map((cells, index) => {
      const line = format(cells);
      return rows[index]!.current ? pc.green(line) : line;
    }),
  ];
}

export function toHistoryJson(
  history: SecretHistory,
  rows: HistoryRow[],
  values: Map<number, string> | null,
  location: { environment: string; folder?: string },
) {
  return {
    key: history.secret.key,
    environment: location.environment,
    folder: location.folder ?? null,
    isDeleted: history.secret.isDeleted,
    retentionLimit: history.retentionLimit,
    versions: rows.map((row) => ({
      version: row.version,
      current: row.current,
      changeType: row.changeType,
      changedAt: new Date(row.changedAt).toISOString(),
      changedBy: row.changedBy,
      ...(values && row.version !== null ? { value: values.get(row.version) ?? null } : {}),
    })),
  };
}
