import { type Pointer, ptr } from "bun:ffi";
import { getLibrary } from "./helper";

type LibraryType = Awaited<ReturnType<typeof getLibrary>>;

export class Bridge {
  private initialized = false;
  private lib: LibraryType;
  private static instance: Bridge | null = null;
  private static instancePromise: Promise<Bridge> | null = null;

  private constructor(lib: LibraryType) {
    this.lib = lib;
  }

  static async getInstance(): Promise<Bridge> {
    if (Bridge.instance) {
      return Bridge.instance;
    }

    if (Bridge.instancePromise) {
      return Bridge.instancePromise;
    }

    Bridge.instancePromise = (async () => {
      const lib = await getLibrary();
      Bridge.instance = new Bridge(lib);
      return Bridge.instance;
    })();

    return Bridge.instancePromise;
  }

  init(): void {
    if (this.lib.symbols.init_terminal() !== 0) {
      throw new Error("Failed to initialize terminal");
    }
    this.initialized = true;
  }

  start(): void {
    if (!this.initialized) {
      throw new Error("Terminal not initialized");
    }

    if (this.lib.symbols.run_terminal_app() !== 0) {
      throw new Error("Failed to start terminal app");
    }
  }

  isRunning(): boolean {
    return this.lib.symbols.is_running() === 1;
  }

  stop_terminal_app(): void {
    this.lib.symbols.stop_terminal_app();
  }

  cleanup_terminal(): void {
    this.lib.symbols.cleanup_terminal();
    this.initialized = false;
  }

  run_relic(args: Pointer): void {
    this.lib.symbols.run_relic(args);
  }
}

// (async () => {
//   const app = await Bridge.getInstance();
//
//   app.init();
//   app.start();
//
//   process.on("SIGINT", () => {
//     app.stop_terminal_app();
//     app.cleanup_terminal();
//     process.exit(0);
//   });
//
//   while (app.isRunning()) {
//     await Bun.sleep(100);
//   }
//
//   app.cleanup_terminal();
//   console.log("App closed successfully");
// })();
