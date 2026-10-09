import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfigDir } from "@repo/auth";
import type { SecretData } from "../lib/api";
import { createRelicDir, findConfig, getCacheDbPath } from "../lib/config";

const dbs = new Map<string, Database>();

export function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      encrypted_project_key TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      name TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      folder_id TEXT,
      key TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      scope TEXT NOT NULL,
      value_type TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS secrets_cache_meta (
      project_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      folder_id TEXT NOT NULL DEFAULT '__root__',
      last_cached_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, environment_id, folder_id)
    )
  `);
}

/** Cache location used when there is no `relic.toml` (project given via `--project` / env). */
export function getGlobalCacheDbPath(projectId: string): string {
  const safeId = projectId.replace(/[^A-Za-z0-9_-]/g, "_");
  return join(getConfigDir(), "cache", `${safeId}.db`);
}

/**
 * Opens the project cache: `.relic/cache.db` next to `relic.toml` when one exists, otherwise a
 * per-project database in the user config directory.
 */
export async function getCacheDb(projectId?: string): Promise<Database> {
  const configResult = await findConfig();

  let cacheDbPath: string;
  if (configResult) {
    await createRelicDir(configResult.rootDir);
    cacheDbPath = getCacheDbPath(configResult.rootDir);
  } else if (projectId) {
    cacheDbPath = getGlobalCacheDbPath(projectId);
    await mkdir(dirname(cacheDbPath), { recursive: true, mode: 0o700 });
  } else {
    throw new Error("No relic.toml found. Run `relic init` first.");
  }

  const existing = dbs.get(cacheDbPath);
  if (existing) return existing;

  const db = new Database(cacheDbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  initializeSchema(db);
  dbs.set(cacheDbPath, db);

  return db;
}

export function closeCacheDb(): void {
  for (const db of dbs.values()) {
    db.close();
  }
  dbs.clear();
}

export function cacheProject(db: Database, projectId: string, encryptedProjectKey: string): void {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO projects (id, encrypted_project_key) VALUES (?, ?)",
  );
  insert.run(projectId, encryptedProjectKey);
}

export function cacheEnvironments(
  db: Database,
  projectId: string,
  environments: Array<{ id: string; name: string }>,
): void {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO environments (id, project_id, name) VALUES (?, ?, ?)",
  );
  for (const env of environments) {
    insert.run(env.id, projectId, env.name);
  }
}

export function cacheFolders(
  db: Database,
  projectId: string,
  folders: Array<{ id: string; environmentId: string; name: string }>,
): void {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO folders (id, project_id, environment_id, name) VALUES (?, ?, ?, ?)",
  );
  for (const folder of folders) {
    insert.run(folder.id, projectId, folder.environmentId, folder.name);
  }
}

export function cacheSecrets(
  db: Database,
  projectId: string,
  environmentId: string,
  folderId: string | undefined,
  secrets: Array<SecretData>,
  updatedAt: number,
): void {
  const resolvedFolderId = folderId ?? null;
  if (resolvedFolderId) {
    db.prepare(
      "DELETE FROM secrets WHERE project_id = ? AND environment_id = ? AND folder_id = ?",
    ).run(projectId, environmentId, resolvedFolderId);
  } else {
    db.prepare(
      "DELETE FROM secrets WHERE project_id = ? AND environment_id = ? AND folder_id IS NULL",
    ).run(projectId, environmentId);
  }
  const insert = db.prepare(
    "INSERT INTO secrets (id, project_id, environment_id, folder_id, key, encrypted_value, scope, value_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const secret of secrets) {
    insert.run(
      secret.id,
      projectId,
      environmentId,
      resolvedFolderId,
      secret.key,
      secret.encryptedValue,
      secret.scope,
      secret.valueType,
    );
  }

  const metaFolderId = folderId ?? "__root__";
  db.prepare(
    "INSERT OR REPLACE INTO secrets_cache_meta (project_id, environment_id, folder_id, last_cached_at) VALUES (?, ?, ?, ?)",
  ).run(projectId, environmentId, metaFolderId, updatedAt);
}

export function getCachedEnvironmentId(
  db: Database,
  projectId: string,
  environmentName: string,
): string | null {
  const row = db
    .prepare("SELECT id FROM environments WHERE project_id = ? AND LOWER(name) = LOWER(?)")
    .get(projectId, environmentName) as { id: string } | null;
  return row?.id ?? null;
}

export function getCachedFolderId(
  db: Database,
  projectId: string,
  environmentId: string,
  folderName: string,
): string | null {
  const row = db
    .prepare(
      "SELECT id FROM folders WHERE project_id = ? AND environment_id = ? AND LOWER(name) = LOWER(?)",
    )
    .get(projectId, environmentId, folderName) as { id: string } | null;
  return row?.id ?? null;
}

export function getCachedSecrets(
  db: Database,
  projectId: string,
  environmentId: string,
  folderId: string | undefined,
  scope: string | undefined,
): SecretData[] | null {
  const resolvedFolderId = folderId ?? null;
  const scopeFilter = scope ? " AND scope = ?" : "";

  const query = resolvedFolderId
    ? db.prepare(
        `SELECT id, key, encrypted_value AS encryptedValue, scope, value_type AS valueType FROM secrets WHERE project_id = ? AND environment_id = ? AND folder_id = ?${scopeFilter}`,
      )
    : db.prepare(
        `SELECT id, key, encrypted_value AS encryptedValue, scope, value_type AS valueType FROM secrets WHERE project_id = ? AND environment_id = ? AND folder_id IS NULL${scopeFilter}`,
      );

  const params: string[] = resolvedFolderId
    ? [projectId, environmentId, resolvedFolderId]
    : [projectId, environmentId];
  if (scope) params.push(scope);

  const rows = query.all(...params);

  if (rows.length === 0) return null;
  return rows as SecretData[];
}

export function loadSecretsLastCachedTime(
  db: Database,
  projectId: string,
  environmentId: string,
  folderId: string | undefined,
): number | null {
  const metaFolderId = folderId ?? "__root__";
  const row = db
    .prepare(
      "SELECT last_cached_at FROM secrets_cache_meta WHERE project_id = ? AND environment_id = ? AND folder_id = ?",
    )
    .get(projectId, environmentId, metaFolderId) as { last_cached_at: number } | null;
  return row?.last_cached_at ?? null;
}

export function loadCachedEncryptedProjectKey(db: Database, projectId: string): string | null {
  const row = db
    .prepare("SELECT encrypted_project_key FROM projects WHERE id = ?")
    .get(projectId) as { encrypted_project_key: string } | null;
  return row?.encrypted_project_key ?? null;
}
