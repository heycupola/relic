import { createConnection, createServer } from "node:net";

export const DEBUG_HOST = "127.0.0.1";

export function findFreePort(host = DEBUG_HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a port"));
      });
    });
  });
}

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function waitForPort(
  port: number,
  options: { host?: string; timeoutMs?: number; intervalMs?: number; isCancelled?: () => boolean },
): Promise<boolean> {
  const host = options.host ?? DEBUG_HOST;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  while (Date.now() < deadline) {
    if (options.isCancelled?.()) return false;
    if (await canConnect(port, host)) return true;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 250));
  }
  return false;
}
