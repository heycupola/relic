import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { findFreePort, waitForPort } from "../src/core/net";

describe("ports", () => {
  test("finds a free port and waits for a listener", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);

    const server = createServer();
    setTimeout(() => server.listen(port, "127.0.0.1"), 100);
    try {
      expect(await waitForPort(port, { timeoutMs: 5_000, intervalMs: 50 })).toBe(true);
    } finally {
      server.close();
    }
  });

  test("stops waiting when cancelled", async () => {
    const port = await findFreePort();
    expect(await waitForPort(port, { timeoutMs: 5_000, isCancelled: () => true })).toBe(false);
  });
});
