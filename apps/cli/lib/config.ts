import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";

const CONFIG_FILE = "relic.toml";
const RELIC_DIR = ".relic";
const CACHE_DB = "cache.db";

export interface RelicConfig {
  project_id: string;
}

export interface ConfigResult {
  config: RelicConfig;
  configPath: string;
  rootDir: string;
}

export async function loadConfig(dir?: string): Promise<ConfigResult | null> {
  const targetDir = dir ?? process.cwd();
  const configPath = join(targetDir, CONFIG_FILE);

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      return null;
    }
    const content = await file.text();
    const config = parse(content) as unknown as RelicConfig;

    return {
      config,
      configPath,
      rootDir: targetDir,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: RelicConfig, dir?: string): Promise<string> {
  const targetDir = dir ?? process.cwd();
  const configPath = join(targetDir, CONFIG_FILE);

  const content = stringify(config);
  await Bun.write(configPath, content);

  return configPath;
}

export async function findConfig(startDir?: string): Promise<ConfigResult | null> {
  let currentDir = resolve(startDir ?? process.cwd());
  const root = resolve("/");
  const home = process.env.HOME ? resolve(process.env.HOME) : null;

  while (currentDir !== root) {
    const configPath = join(currentDir, CONFIG_FILE);

    const file = Bun.file(configPath);
    if (await file.exists()) {
      try {
        const content = await file.text();
        const config = parse(content) as unknown as RelicConfig;
        return { config, configPath, rootDir: currentDir };
      } catch {
        return null;
      }
    }

    if (home && currentDir === home) {
      return null;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

export async function configExists(dir?: string): Promise<boolean> {
  const targetDir = dir ?? process.cwd();
  const configPath = join(targetDir, CONFIG_FILE);
  const file = Bun.file(configPath);
  return file.exists();
}

export function createConfig(projectId: string): RelicConfig {
  return {
    project_id: projectId,
  };
}

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

export function getRelicDir(rootDir: string): string {
  return join(rootDir, RELIC_DIR);
}

export function getCacheDbPath(rootDir: string): string {
  return join(rootDir, RELIC_DIR, CACHE_DB);
}

export async function createRelicDir(dir?: string): Promise<string> {
  const targetDir = dir ?? process.cwd();
  const relicDir = join(targetDir, RELIC_DIR);
  await mkdir(relicDir, { recursive: true });
  return relicDir;
}

export async function findRelicDir(startDir?: string): Promise<string | null> {
  const configResult = await findConfig(startDir);
  if (!configResult) return null;
  return getRelicDir(configResult.rootDir);
}
