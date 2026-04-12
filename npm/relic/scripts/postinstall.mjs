import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let version;
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  version = pkg.version;
} catch {
  version = "unknown";
}

const dim = (t) => `\x1b[2m${t}\x1b[22m`;
const bold = (t) => `\x1b[1m${t}\x1b[22m`;
const cyan = (t) => `\x1b[36m${t}\x1b[39m`;
const green = (t) => `\x1b[32m${t}\x1b[39m`;

const lines = [
  "",
  `  ${bold("relic")} ${dim(`v${version}`)}`,
  `  ${dim("Zero-knowledge secret layer for your projects")}`,
  "",
  `  ${green("✓")} Installed successfully`,
  "",
  `  Get started:`,
  `    ${dim("$")} ${cyan("relic login")}       ${dim("Sign in to your account")}`,
  `    ${dim("$")} ${cyan("relic init")}        ${dim("Initialize in your project")}`,
  `    ${dim("$")} ${cyan("relic --help")}      ${dim("See all commands")}`,
  "",
  `  ${dim("https://relic.so/docs")}`,
  "",
];

console.log(lines.join("\n"));
