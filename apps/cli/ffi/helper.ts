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

  const prebuiltPath = `${import.meta.dir}/../bindings/prebuilt/${targetPlatform}/${libName}`;
  const debugPath = `${import.meta.dir}/../bindings/target/debug/${libName}`;
  const releasePath = `${import.meta.dir}/../bindings/target/release/${libName}`;

  let libraryPath: string;

  if (await Bun.file(prebuiltPath).exists()) {
    libraryPath = prebuiltPath;
    console.log(`Loading prebuilt binary for ${platformKey}`);
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
        `Please run: cd rust && cargo build --release`,
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
