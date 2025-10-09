import { dlopen, FFIType, suffix } from "bun:ffi";
import { existsSync } from "fs";
import { arch, platform } from "os";
import { join } from "path";

function getPlatformLibrary(): string {
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
      `Unsupported platform: ${platformKey}. Supported platforms: ${Object.keys(PLATFORM_MAP).join(", ")}`,
    );
  }

  const libName = platform() === "win32" ? "rust.dll" : `librust.${suffix}`;

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
        `Please run: cd rust && cargo build --release`,
    );
  }

  return libraryPath;
}

const lib = dlopen(getPlatformLibrary(), {
  init_terminal: {
    args: [],
    returns: FFIType.i32,
  },
  run_terminal_app: {
    args: [],
    returns: FFIType.i32,
  },
  update_text: {
    args: [FFIType.cstring],
    returns: FFIType.void,
  },
  update_counter: {
    args: [FFIType.i32],
    returns: FFIType.void,
  },
  get_counter: {
    args: [],
    returns: FFIType.i32,
  },
  is_running: {
    args: [],
    returns: FFIType.i32,
  },
  stop_terminal_app: {
    args: [],
    returns: FFIType.void,
  },
  wait_for_completion: {
    args: [],
    returns: FFIType.void,
  },
  cleanup_terminal: {
    args: [],
    returns: FFIType.void,
  },
});

export class App {
  private initialized = false;

  init(): void {
    if (lib.symbols.init_terminal() !== 0) {
      throw new Error("Failed to initialize terminal");
    }
    this.initialized = true;
  }

  start(): void {
    if (!this.initialized) {
      throw new Error("Terminal not this.initialized");
    }

    if (lib.symbols.run_terminal_app() !== 0) {
      throw new Error("Failed to start loop");
    }
  }

  isRunning(): boolean {
    return lib.symbols.is_running() === 1;
  }

  stop(): void {
    lib.symbols.stop_terminal_app();
  }

  cleanup(): void {
    lib.symbols.cleanup_terminal();
    this.initialized = false;

    process.exit(1);
  }
}

const app = new App();

app.init();
app.start();

process.on("SIGINT", () => {
  app.stop();
  app.cleanup();
  process.exit(0);
});

while (app.isRunning()) {
  await Bun.sleep(100);
}

app.cleanup();
console.log("App is closed!..");
