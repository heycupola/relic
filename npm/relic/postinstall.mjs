import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:os";
import { get } from "node:https";
import { createGunzip } from "node:zlib";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));
const version = pkg.version;

const PLATFORM_MAP = {
  "darwin-arm64": { archive: `relic-darwin-arm64.tar.gz`, binary: "relic" },
  "darwin-x64": { archive: `relic-darwin-x64.tar.gz`, binary: "relic" },
  "linux-x64": { archive: `relic-linux-x64.tar.gz`, binary: "relic" },
  "win32-x64": { archive: `relic-win32-x64.zip`, binary: "relic.exe" },
};

const currentPlatform = `${platform()}-${arch()}`;
const target = PLATFORM_MAP[currentPlatform];

if (!target) {
  console.warn(
    `[relic] Unsupported platform: ${currentPlatform}. ` +
    `Supported: ${Object.keys(PLATFORM_MAP).join(", ")}`
  );
  process.exit(0);
}

const binDir = join(__dirname, "bin");
const binaryPath = join(binDir, target.binary);

if (existsSync(binaryPath)) {
  process.exit(0);
}

const url = `https://github.com/heycupola/relic/releases/download/v${version}/${target.archive}`;

function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
      }
      resolve(res);
    }).on("error", reject);
  });
}

async function extractTarGz(stream, destDir) {
  const tmpFile = join(destDir, "_tmp.tar.gz");
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(tmpFile);
    stream.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  execSync(`tar -xzf "${tmpFile}" -C "${destDir}"`, { stdio: "ignore" });
  unlinkSync(tmpFile);
}

async function extractZip(stream, destDir) {
  const tmpFile = join(destDir, "_tmp.zip");
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(tmpFile);
    stream.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  execSync(`unzip -o -q "${tmpFile}" -d "${destDir}"`, { stdio: "ignore" });
  unlinkSync(tmpFile);
}

try {
  mkdirSync(binDir, { recursive: true });

  console.log(`[relic] Downloading ${target.archive} for ${currentPlatform}...`);
  const stream = await download(url);

  if (target.archive.endsWith(".tar.gz")) {
    await extractTarGz(stream, binDir);
  } else {
    await extractZip(stream, binDir);
  }

  if (existsSync(binaryPath)) {
    chmodSync(binaryPath, 0o755);
  }

  console.log(`[relic] Installed successfully.`);
} catch (err) {
  console.warn(
    `[relic] Failed to download binary: ${err.message}\n` +
    `[relic] You can download manually from: https://github.com/heycupola/relic/releases`
  );
  process.exit(0);
}
