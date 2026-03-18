import { dlopen, FFIType, suffix } from "bun:ffi";
import { dirname } from "node:path";
import { ISSUES_URL, RELEASES_URL } from "./constants";

type Environment = "development" | "production";

const PLATFORM_MAP: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "win32-x64": "win32-x64",
};

// `import.meta.dir` resolves to `/$bunfs/…` inside a Bun standalone binary.
// This is a Bun-internal convention — update this check if it ever changes.
function isCompiledBinary(): boolean {
  return import.meta.dir.startsWith("/$bunfs/");
}

function getBaseDir(): string {
  if (isCompiledBinary()) {
    return dirname(process.execPath);
  }
  return import.meta.dir;
}

async function detectEnvironment(): Promise<Environment> {
  if (process.env.DEV === "true") {
    return "development";
  }

  if (isCompiledBinary()) {
    return "production";
  }

  const prebuildsPath = `${import.meta.dir}/../prebuilds`;
  if (await Bun.file(prebuildsPath).exists()) {
    return "production";
  }

  const turboJsonPath = `${import.meta.dir}/../../../turbo.json`;
  if (await Bun.file(turboJsonPath).exists()) {
    return "development";
  }

  return "production";
}

function getRunnerPath(): string {
  return `${import.meta.dir}/../../../packages/runner`;
}

function getLibraryName(): string {
  return process.platform === "win32" ? "relic_runner.dll" : `librelic_runner.${suffix}`;
}

function getProductionError(platform: string): Error {
  return new Error(
    `Rust library not found for ${platform}.\n\n` +
      `This appears to be a packaging issue. Please try reinstalling:\n` +
      `  - If installed via package manager: uninstall and reinstall relic\n` +
      `  - If using binaries: re-download from ${RELEASES_URL}\n\n` +
      `If the problem persists, report at: ${ISSUES_URL}`,
  );
}

function getDevelopmentError(platform: string): Error {
  return new Error(
    `Rust library not found for ${platform}.\n\n` +
      `Build the runner first:\n` +
      `  cd packages/runner && cargo build --release`,
  );
}

async function findLibraryInProduction(
  targetPlatform: string,
  libName: string,
): Promise<string | null> {
  const baseDir = getBaseDir();
  const searchPaths = [
    `${baseDir}/${libName}`,
    `${baseDir}/../lib/${libName}`,
    `${baseDir}/../prebuilds/${targetPlatform}/${libName}`,
  ];

  for (const candidate of searchPaths) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  return null;
}

async function findLibraryInDevelopment(
  targetPlatform: string,
  libName: string,
): Promise<string | null> {
  const runnerPath = getRunnerPath();

  const paths = [
    `${runnerPath}/target/release/${libName}`,
    `${runnerPath}/target/debug/${libName}`,
    `${runnerPath}/prebuilt/${targetPlatform}/${libName}`,
  ];

  for (const path of paths) {
    if (await Bun.file(path).exists()) {
      return path;
    }
  }

  return null;
}

export async function getPlatformLibrary(): Promise<string> {
  const platformKey = `${process.platform}-${process.arch}`;
  const targetPlatform = PLATFORM_MAP[platformKey];

  if (!targetPlatform) {
    throw new Error(
      `Unsupported platform: ${platformKey}. Supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`,
    );
  }

  const libName = getLibraryName();
  const env = await detectEnvironment();

  if (env === "production") {
    const libraryPath = await findLibraryInProduction(targetPlatform, libName);
    if (libraryPath) {
      return libraryPath;
    }
    throw getProductionError(platformKey);
  }

  const libraryPath = await findLibraryInDevelopment(targetPlatform, libName);
  if (libraryPath) {
    return libraryPath;
  }
  throw getDevelopmentError(platformKey);
}

export async function getLibrary() {
  const lib = dlopen(await getPlatformLibrary(), {
    run_with_secrets: {
      args: [FFIType.cstring, FFIType.cstring],
      returns: FFIType.i32,
    },
  });

  return lib;
}
