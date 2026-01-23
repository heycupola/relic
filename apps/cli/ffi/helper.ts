import { dlopen, FFIType, suffix } from "bun:ffi";
import { ISSUES_URL, RELEASES_URL } from "./constants";

type Environment = "development" | "production";

const PLATFORM_MAP: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "win32-x64": "win32-x64",
};

async function detectEnvironment(): Promise<Environment> {
  const turboJsonPath = `${import.meta.dir}/../../../turbo.json`;
  if (await Bun.file(turboJsonPath).exists()) {
    return "development";
  }
  return "production";
}

function getCliCorePath(): string {
  return `${import.meta.dir}/../../../packages/cli-core`;
}

function getLibraryName(): string {
  return process.platform === "win32" ? "relic_core.dll" : `librelic_core.${suffix}`;
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
      `Build the Rust core first:\n` +
      `  cd packages/cli-core && cargo build --release`,
  );
}

async function findLibraryInProduction(
  targetPlatform: string,
  libName: string,
): Promise<string | null> {
  const prebuildsPath = `${import.meta.dir}/../prebuilds/${targetPlatform}/${libName}`;

  if (await Bun.file(prebuildsPath).exists()) {
    return prebuildsPath;
  }

  return null;
}

async function findLibraryInDevelopment(
  targetPlatform: string,
  libName: string,
): Promise<string | null> {
  const cliCorePath = getCliCorePath();

  const paths = [
    `${cliCorePath}/target/release/${libName}`,
    `${cliCorePath}/target/debug/${libName}`,
    `${cliCorePath}/prebuilt/${targetPlatform}/${libName}`,
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
    run_app: {
      args: [FFIType.cstring],
      returns: FFIType.void,
    },
  });

  return lib;
}
