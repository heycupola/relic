import { dlopen, FFIType, suffix } from "bun:ffi";

export async function getPlatformLibrary(): Promise<string> {
  const PLATFORM_MAP: Record<string, string> = {
    "darwin-arm64": "darwin-arm64",
    "darwin-x64": "darwin-x64",
    "linux-x64": "linux-x64",
    "win32-x64": "win32-x64",
  };

  const platformKey = `${process.platform}-${process.arch}`;
  const targetPlatform = PLATFORM_MAP[platformKey];

  if (!targetPlatform) {
    throw new Error(
      `Unsupported platform: ${platformKey}. Supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`,
    );
  }

  const libName = process.platform === "win32" ? "relic.dll" : `librelic.${suffix}`;

  const rustRoot = `${import.meta.dir}/../../packages/cli-core`;
  const prebuiltPath = `${rustRoot}/prebuilt/${targetPlatform}/${libName}`;
  const legacyPrebuiltPath = `${import.meta.dir}/../prebuilds/${targetPlatform}/${libName}`;
  const debugPath = `${rustRoot}/target/debug/${libName}`;
  const releasePath = `${rustRoot}/target/release/${libName}`;

  let libraryPath: string;

  if (await Bun.file(prebuiltPath).exists()) {
    libraryPath = prebuiltPath;
    console.log(`Loading prebuilt binary for ${platformKey}`);
  } else if (await Bun.file(legacyPrebuiltPath).exists()) {
    libraryPath = legacyPrebuiltPath;
    console.log(`Loading prebuilt binary for ${platformKey} (legacy path)`);
  } else if (await Bun.file(releasePath).exists()) {
    libraryPath = releasePath;
    console.log(`Loading release binary for ${platformKey}`);
  } else if (await Bun.file(debugPath).exists()) {
    libraryPath = debugPath;
    console.log(`Loading debug binary for ${platformKey}`);
  } else {
    throw new Error(
      `Could not find Rust library for ${platformKey}.\n` +
        `Tried:\n` +
        `  - ${prebuiltPath}\n` +
        `  - ${releasePath}\n` +
        `  - ${debugPath}\n\n` +
        `Please run: cd packages/cli-core && cargo build --release`,
    );
  }

  return libraryPath;
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
