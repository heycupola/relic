import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";

const CONFIG_DIR = ".relic";
const CONFIG_FILE = "config.toml";

export interface RelicConfig {
  project_id: string;
  project_name: string;
}

export interface ConfigResult {
  config: RelicConfig;
  configPath: string;
  rootDir: string;
}

async function ensureConfigDir(dir: string): Promise<void> {
  const configDir = join(dir, CONFIG_DIR);
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(configDir, { recursive: true });
  } catch (_) {
    void 0;
  }
}

export async function loadConfig(dir?: string): Promise<ConfigResult | null> {
  const targetDir = dir ?? process.cwd();
  const configDir = join(targetDir, CONFIG_DIR);
  const configPath = join(configDir, CONFIG_FILE);

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
  await ensureConfigDir(targetDir);

  const configDir = join(targetDir, CONFIG_DIR);
  const configPath = join(configDir, CONFIG_FILE);

  const content = stringify(config);
  await Bun.write(configPath, content);

  return configPath;
}

export async function findConfig(startDir?: string): Promise<ConfigResult | null> {
  let currentDir = resolve(startDir ?? process.cwd());
  const root = resolve("/");

  while (currentDir !== root) {
    const configDir = join(currentDir, CONFIG_DIR);
    const configPath = join(configDir, CONFIG_FILE);

    try {
      const file = Bun.file(configPath);
      if (await file.exists()) {
        const content = await file.text();
        const config = parse(content) as unknown as RelicConfig;

        return {
          config,
          configPath,
          rootDir: currentDir,
        };
      }
    } catch {
      void 0;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

export async function configExists(dir?: string): Promise<boolean> {
  const targetDir = dir ?? process.cwd();
  const configDir = join(targetDir, CONFIG_DIR);
  const configPath = join(configDir, CONFIG_FILE);
  const file = Bun.file(configPath);
  return file.exists();
}

export function createConfig(projectId: string, projectName: string): RelicConfig {
  return {
    project_id: projectId,
    project_name: projectName,
  };
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFilePath(): string {
  return `${CONFIG_DIR}/${CONFIG_FILE}`;
}
