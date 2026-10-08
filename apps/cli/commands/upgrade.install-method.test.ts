import { describe, expect, test } from "bun:test";
import { detectInstallMethodFromExecutablePath } from "./upgrade.install-method";

describe("detectInstallMethodFromExecutablePath", () => {
  test("detects bun global install from platform binary path", () => {
    const path = "/Users/dev/.bun/install/global/node_modules/relic-cli-darwin-arm64/bin/relic";
    expect(detectInstallMethodFromExecutablePath(path)).toBe("bun");
  });

  test("detects npm global install from platform binary path", () => {
    const path = "/opt/homebrew/lib/node_modules/relic-cli-darwin-arm64/bin/relic";
    expect(detectInstallMethodFromExecutablePath(path)).toBe("npm");
  });

  test("detects homebrew formula binary in Cellar", () => {
    const path = "/opt/homebrew/Cellar/relic/0.9.3/bin/relic";
    expect(detectInstallMethodFromExecutablePath(path)).toBe("homebrew");
  });

  test("returns null for unrecognized paths", () => {
    expect(detectInstallMethodFromExecutablePath("/usr/local/bin/relic")).toBe(null);
  });
});
