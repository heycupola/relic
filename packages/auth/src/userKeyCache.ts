import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { CONFIG_DIR } from "./paths";

const DB_PATH = resolve(CONFIG_DIR, "relic.db");

export interface CachedUserKeys {
  encryptedPrivateKey: string;
  salt: string;
  publicKey?: string;
  keysUpdatedAt: number;
}

let db: Database | null = null;

async function ensureConfigDir(): Promise<void> {
  const { mkdir, chmod } = await import("node:fs/promises");
  try {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(CONFIG_DIR, 0o700);
    }
  } catch (_) {
    void 0;
  }
}

export function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_keys (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      encrypted_private_key TEXT NOT NULL,
      salt TEXT NOT NULL,
      public_key TEXT,
      keys_updated_at INTEGER NOT NULL
    )
  `);
}

export async function getUserKeyCacheDb(): Promise<Database> {
  if (db) return db;

  await ensureConfigDir();
  db = new Database(DB_PATH, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  initializeSchema(db);

  return db;
}

export function getCachedUserKeys(db: Database): CachedUserKeys | null {
  try {
    const row = db
      .prepare(
        "SELECT encrypted_private_key, salt, public_key, keys_updated_at FROM user_keys WHERE id = 1",
      )
      .get() as {
      encrypted_private_key: string;
      salt: string;
      public_key: string | null;
      keys_updated_at: number;
    } | null;

    if (!row) return null;

    return {
      encryptedPrivateKey: row.encrypted_private_key,
      salt: row.salt,
      publicKey: row.public_key ?? undefined,
      keysUpdatedAt: row.keys_updated_at,
    };
  } catch (_) {
    return null;
  }
}

export function cacheUserKeys(db: Database, keys: CachedUserKeys): void {
  try {
    db.prepare(
      "INSERT OR REPLACE INTO user_keys (id, encrypted_private_key, salt, public_key, keys_updated_at) VALUES (1, ?, ?, ?, ?)",
    ).run(keys.encryptedPrivateKey, keys.salt, keys.publicKey ?? null, keys.keysUpdatedAt);
  } catch (_) {
    void 0;
  }
}

export function clearCachedUserKeys(db: Database): void {
  try {
    db.prepare("DELETE FROM user_keys").run();
  } catch (_) {
    void 0;
  }
}
