import { dlopen, FFIType, suffix } from "bun:ffi";
import { platform, arch } from "os";
import { existsSync } from "fs";
import { join } from "path";

// Platform mapping
const PLATFORM_MAP: Record<string, string> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "win32-x64": "win32-x64",
};

const platformKey = `${platform()}-${arch()}`;
const targetPlatform = PLATFORM_MAP[platformKey];

if (!targetPlatform) {
  throw new Error(
    `Unsupported platform: ${platformKey}. Supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`
  );
}

// Determine library name based on platform
const libName = platform() === "win32" ? "rust.dll" : `librust.${suffix}`;

// Try prebuilt first (production), then fall back to debug build (development)
const prebuiltPath = join(import.meta.dir, "rust", "prebuilt", targetPlatform, libName);
const debugPath = join(import.meta.dir, "rust", "target", "debug", libName);
const releasePath = join(import.meta.dir, "rust", "target", "release", libName);

let libraryPath: string;

if (existsSync(prebuiltPath)) {
  libraryPath = prebuiltPath;
  console.log(`Loading prebuilt binary for ${platformKey}`);
} else if (existsSync(releasePath)) {
  libraryPath = releasePath;
  console.log(`Loading release binary for ${platformKey}`);
} else if (existsSync(debugPath)) {
  libraryPath = debugPath;
  console.log(`Loading debug binary for ${platformKey}`);
} else {
  throw new Error(
    `Could not find Rust library for ${platformKey}.\n` +
    `Tried:\n` +
    `  - ${prebuiltPath}\n` +
    `  - ${releasePath}\n` +
    `  - ${debugPath}\n\n` +
    `Please run: cd rust && cargo build --release`
  );
}

// Load the library
const lib = dlopen(libraryPath, {
  add: {
    args: [FFIType.u64, FFIType.u64],
    returns: FFIType.u64
  }
});

// Test the function
const result = lib.symbols.add(5, 3);
console.log("Result:", Number(result));
