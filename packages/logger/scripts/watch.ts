import { watch } from "node:fs";
import { ensureLogDir, getConfig } from "../config";

const config = getConfig();
const LOG_FILE = process.argv[2] || config.logFile;

ensureLogDir(LOG_FILE);

let lastSize = 0;

async function readNewContent() {
  const file = Bun.file(LOG_FILE);
  if (!(await file.exists())) return;

  const currentSize = file.size;
  if (currentSize > lastSize) {
    const content = await file.text();
    const newContent = content.slice(lastSize);
    if (newContent) process.stdout.write(newContent);
    lastSize = currentSize;
  } else if (currentSize < lastSize) {
    lastSize = 0;
    const content = await file.text();
    process.stdout.write(content);
    lastSize = currentSize;
  }
}

console.log(`Watching ${LOG_FILE}...\n`);

await readNewContent();

watch(LOG_FILE, async () => {
  await readNewContent();
});

process.on("SIGINT", () => process.exit(0));

await Bun.sleep(Number.MAX_SAFE_INTEGER);
