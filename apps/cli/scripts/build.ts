import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BunPlugin } from "bun";

const CLI_DIR = join(dirname(import.meta.dir));
const DIST_DIR = join(CLI_DIR, "dist");
const SOURCE_ENTRY = join(CLI_DIR, "index.ts");
const BUILD_ENTRY = join(CLI_DIR, ".bundle-entry.ts");

const OPENTUI_NATIVE_FILE_NAMES: Record<string, string> = {
  darwin: "libopentui.dylib",
  linux: "libopentui.so",
  win32: "opentui.dll",
};

// The release ships OpenTUI's native library next to the compiled `relic` binary, and only the
// host's `@opentui/core-<platform>` package is installed on each CI runner.
const opentuiNativeNextToExecutable: BunPlugin = {
  name: "opentui-native-next-to-executable",
  setup(build) {
    build.onResolve({ filter: /^@opentui\/core-(darwin|linux|win32)-[\w-]+$/ }, (args) => ({
      path: args.path,
      namespace: "opentui-native",
    }));
    build.onLoad({ filter: /.*/, namespace: "opentui-native" }, (args) => {
      const platform = args.path.replace(/^@opentui\/core-/, "").split("-")[0] ?? "";
      const fileName = OPENTUI_NATIVE_FILE_NAMES[platform];
      if (!fileName) {
        throw new Error(`Unknown OpenTUI native package: ${args.path}`);
      }
      return {
        loader: "js",
        contents: [
          'import { dirname, join } from "node:path";',
          `export default join(dirname(process.execPath), ${JSON.stringify(fileName)});`,
        ].join("\n"),
      };
    });
  },
};

if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log("Bundling CLI...");

const entrySource = readFileSync(SOURCE_ENTRY, "utf-8");
const bundlerSource = entrySource.replace(
  "await loadTui();",
  'await import("../../packages/tui/index.tsx");',
);

if (bundlerSource === entrySource) {
  throw new Error("Failed to rewrite the TUI loader for the bundle entry.");
}

writeFileSync(BUILD_ENTRY, bundlerSource);

const result = await (async () => {
  try {
    return await Bun.build({
      entrypoints: [BUILD_ENTRY],
      outdir: DIST_DIR,
      naming: "cli.js",
      target: "bun",
      minify: { syntax: true },
      plugins: [opentuiNativeNextToExecutable],
    });
  } finally {
    if (existsSync(BUILD_ENTRY)) {
      rmSync(BUILD_ENTRY);
    }
  }
})();

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outputFile = join(DIST_DIR, "cli.js");
writeFileSync(outputFile, `#!/usr/bin/env bun\n${readFileSync(outputFile, "utf-8")}`);
chmodSync(outputFile, 0o755);

console.log(`Build succeeded → ${outputFile}`);
