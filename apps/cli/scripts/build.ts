import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CLI_DIR = join(dirname(import.meta.dir));
const DIST_DIR = join(CLI_DIR, "dist");
const SOURCE_ENTRY = join(CLI_DIR, "index.ts");
const BUILD_ENTRY = join(CLI_DIR, ".bundle-entry.ts");

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
      external: [],
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
let bundled = readFileSync(outputFile, "utf-8");

const OPENTUI_IMPORT_PATTERN =
  "module = await import(`@opentui/core-${process.platform}-${process.arch}/index.ts`), targetLibPath = module.default";
const OPENTUI_REPLACEMENT =
  'targetLibPath = (() => { const ext = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so"; return process.execPath.replace(/[\\/\\\\][^\\/\\\\]*$/, "") + "/libopentui." + ext; })()';

if (bundled.includes(OPENTUI_IMPORT_PATTERN)) {
  bundled = bundled.replace(OPENTUI_IMPORT_PATTERN, OPENTUI_REPLACEMENT);
  console.log("Patched OpenTUI native library resolution for compiled binary.");
} else {
  console.warn("Warning: OpenTUI import pattern not found — skipping patch.");
}

writeFileSync(outputFile, `#!/usr/bin/env bun\n${bundled}`);
chmodSync(outputFile, 0o755);

console.log(`Build succeeded → ${outputFile}`);
