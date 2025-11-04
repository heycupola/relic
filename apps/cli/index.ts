import { ptr } from "bun:ffi";
import { Bridge } from "./ffi/bridge";

(async () => {
  const bridge = await Bridge.getInstance();

  const args = process.argv.slice(2);
  const argsJson = JSON.stringify(args);

  const buffer = Buffer.from(`${argsJson}\0`, "utf-8");
  const pointer = ptr(buffer);

  bridge.runApp(pointer);
})();
