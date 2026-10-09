import { describe, expect, test } from "bun:test";
import { quoteArg, runArgs, runCommandLine, shellArgs, shellKindFor } from "../src/core/args";
import { parseProjectId } from "../src/core/config";
import { detectPackageManager, readScripts, scriptCommand } from "../src/core/packageManager";

describe("runArgs", () => {
  test("builds relic run arguments", () => {
    expect(runArgs({ environment: "development" }, ["npm", "run", "dev"])).toEqual([
      "run",
      "-e",
      "development",
      "--",
      "npm",
      "run",
      "dev",
    ]);
  });

  test("includes folder and scope", () => {
    expect(
      runArgs({ environment: "prod", folder: "api", scope: "server" }, ["node", "index.js"]),
    ).toEqual(["run", "-e", "prod", "-f", "api", "-s", "server", "--", "node", "index.js"]);
  });

  test("builds relic shell arguments", () => {
    expect(shellArgs({ environment: "staging" })).toEqual(["shell", "-e", "staging"]);
  });
});

describe("quoting", () => {
  test("leaves safe arguments alone", () => {
    expect(quoteArg("development", "posix")).toBe("development");
    expect(quoteArg("/usr/local/bin/relic", "posix")).toBe("/usr/local/bin/relic");
  });

  test("quotes per shell", () => {
    expect(quoteArg("it's here", "posix")).toBe(`'it'\\''s here'`);
    expect(quoteArg("it's here", "powershell")).toBe(`'it''s here'`);
    expect(quoteArg('say "hi"', "cmd")).toBe(`"say ""hi"""`);
    expect(quoteArg("--", "powershell")).toBe("'--'");
  });

  test("keeps the user's command verbatim after --", () => {
    expect(
      runCommandLine("relic", { environment: "dev" }, "npm run dev -- --port 3000", "posix"),
    ).toBe("relic run -e dev -- npm run dev -- --port 3000");
  });

  test("invokes quoted paths with & in PowerShell", () => {
    expect(
      runCommandLine(
        "C:\\Program Files\\relic.exe",
        { environment: "dev" },
        "npm test",
        "powershell",
      ),
    ).toBe("& 'C:\\Program Files\\relic.exe' run -e dev '--' npm test");
  });

  test("detects shell kinds", () => {
    expect(shellKindFor("darwin", "/bin/zsh")).toBe("posix");
    expect(shellKindFor("win32", "C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(shellKindFor("win32", "C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
    expect(shellKindFor("win32")).toBe("powershell");
    expect(shellKindFor("linux")).toBe("posix");
  });
});

describe("parseProjectId", () => {
  test("reads project_id from relic.toml", () => {
    expect(parseProjectId('project_id = "jx7abc123"\n')).toBe("jx7abc123");
  });

  test("returns null for missing or invalid config", () => {
    expect(parseProjectId("")).toBeNull();
    expect(parseProjectId("project_id = 42")).toBeNull();
    expect(parseProjectId("not toml [")).toBeNull();
  });
});

describe("package managers", () => {
  test("prefers the packageManager field", () => {
    expect(detectPackageManager(["package-lock.json"], "pnpm@9.0.0")).toBe("pnpm");
  });

  test("falls back to lockfiles, then npm", () => {
    expect(detectPackageManager(["bun.lock"])).toBe("bun");
    expect(detectPackageManager(["yarn.lock"])).toBe("yarn");
    expect(detectPackageManager([])).toBe("npm");
  });

  test("reads string scripts only", () => {
    expect(
      readScripts(
        JSON.stringify({ scripts: { dev: "vite", bad: 1 }, packageManager: "bun@1.3.2" }),
      ),
    ).toEqual({ scripts: ["dev"], packageManager: "bun@1.3.2" });
    expect(readScripts("{")).toEqual({ scripts: [] });
    expect(scriptCommand("bun", "dev")).toEqual(["bun", "run", "dev"]);
  });
});
