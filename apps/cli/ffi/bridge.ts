import type { Pointer } from "bun:ffi";
import { getLibrary } from "./helper";

type LibraryType = Awaited<ReturnType<typeof getLibrary>>;

export class Bridge {
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

  runApp(args: Pointer): void {
    this.lib.symbols.run_app(args);
  }
}
