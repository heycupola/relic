import type { Pointer } from "bun:ffi";
import { getLibrary } from "./helper";

type LibraryType = Awaited<ReturnType<typeof getLibrary>>;

export class RunnerBridge {
  private lib: LibraryType;
  private static instance: RunnerBridge | null = null;
  private static instancePromise: Promise<RunnerBridge> | null = null;

  private constructor(lib: LibraryType) {
    this.lib = lib;
  }

  static async getInstance(): Promise<RunnerBridge> {
    if (RunnerBridge.instance) {
      return RunnerBridge.instance;
    }

    if (RunnerBridge.instancePromise) {
      return RunnerBridge.instancePromise;
    }

    RunnerBridge.instancePromise = (async () => {
      const lib = await getLibrary();
      RunnerBridge.instance = new RunnerBridge(lib);
      return RunnerBridge.instance;
    })();

    return RunnerBridge.instancePromise;
  }

  /**
   * Run a command with secrets injected as environment variables.
   * @param command - Pointer to JSON string: ["cmd", "arg1", "arg2"]
   * @param secrets - Pointer to JSON string: {"KEY": "value"}
   * @returns Exit code of the spawned process, or -1 on error
   */
  runWithSecrets(command: Pointer, secrets: Pointer): number {
    return this.lib.symbols.run_with_secrets(command, secrets);
  }
}
