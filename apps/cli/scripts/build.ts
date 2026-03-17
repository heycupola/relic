import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CLI_DIR = join(dirname(import.meta.dir));
const DIST_DIR = join(CLI_DIR, "dist");

if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log("Bundling CLI...");

const result = await Bun.build({
  entrypoints: [join(CLI_DIR, "index.ts")],
  outdir: DIST_DIR,
  naming: "cli.js",
  target: "bun",
  minify: { syntax: true },
  external: ["argon2"],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const outputFile = join(DIST_DIR, "cli.js");
const bundled = readFileSync(outputFile, "utf-8");
writeFileSync(outputFile, `#!/usr/bin/env bun\n${bundled}`);
chmodSync(outputFile, 0o755);

console.log(`Build succeeded → ${outputFile}`);
