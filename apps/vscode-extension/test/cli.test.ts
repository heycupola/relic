import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCommandHelp,
  parseJsonResult,
  parseVersion,
  RelicCli,
  RelicCliError,
} from "../src/core/cli";

function expectKind(fn: () => unknown, kind: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(RelicCliError);
    expect((err as RelicCliError).kind).toBe(kind as RelicCliError["kind"]);
    return;
  }
  throw new Error("expected a RelicCliError");
}

describe("parseJsonResult", () => {
  test("returns parsed JSON on success", () => {
    expect(parseJsonResult<unknown>({ stdout: '[{"id":"p"}]', stderr: "", exitCode: 0 })).toEqual([
      { id: "p" },
    ]);
  });

  test("skips non-JSON preamble lines", () => {
    expect(
      parseJsonResult<unknown>({ stdout: 'notice\n{"ok":true}', stderr: "", exitCode: 0 }),
    ).toEqual({
      ok: true,
    });
  });

  test("maps JSON error codes", () => {
    const error = (code: string) => ({
      stdout: JSON.stringify({ error: { code, message: "m" } }),
      stderr: "",
      exitCode: 1,
    });
    expectKind(() => parseJsonResult(error("not_logged_in")), "not_logged_in");
    expectKind(() => parseJsonResult(error("environment_not_found")), "not_found");
    expectKind(() => parseJsonResult(error("no_config")), "no_config");
    expectKind(() => parseJsonResult(error("something_else")), "failed");
  });

  test("detects CLIs without the JSON commands", () => {
    expectKind(
      () =>
        parseJsonResult({
          stdout: "",
          stderr: "  Error: unknown option '--json'",
          exitCode: 1,
        }),
      "outdated",
    );
    expectKind(
      () => parseJsonResult({ stdout: "", stderr: "Unknown command: secrets", exitCode: 1 }),
      "outdated",
    );
  });

  test("detects a missing CLI behind a Windows shell", () => {
    expectKind(
      () =>
        parseJsonResult({
          stdout: "",
          stderr: "'relic' is not recognized as an internal or external command",
          exitCode: 1,
        }),
      "not_installed",
    );
  });

  test("detects subcommand help rather than root help", () => {
    const help = (stdout: string, exitCode = 0) => ({ stdout, stderr: "", exitCode });
    expect(isCommandHelp(help("Usage: relic shell [options]\n"), "shell")).toBe(true);
    expect(isCommandHelp(help("  Usage  $ relic <command> [options]\n"), "shell")).toBe(false);
    expect(isCommandHelp(help("Usage: relic shellish [options]\n"), "shell")).toBe(false);
    expect(isCommandHelp(help("Usage: relic shell [options]\n", 1), "shell")).toBe(false);
  });

  test("parses versions", () => {
    expect(parseVersion("0.9.4\n")).toBe("0.9.4");
    expect(parseVersion("relic v1.2.3-beta.1")).toBe("1.2.3-beta.1");
    expect(parseVersion("nope")).toBeNull();
  });
});

describe.skipIf(process.platform === "win32")("RelicCli against a fake binary", () => {
  const dir = mkdtempSync(join(tmpdir(), "relic-cli-test-"));
  const log = join(dir, "calls.log");
  const bin = join(dir, "relic");
  writeFileSync(
    bin,
    `#!/bin/sh
echo "$@" >> "${log}"
case "$1" in
  --version) echo "0.10.0" ;;
  projects) echo '[{"id":"proj_1","name":"Api","environments":[{"id":"e1","name":"development","folders":[]}]}]' ;;
  secrets) echo '{"projectId":"proj_1","environment":"development","folder":null,"secrets":[{"name":"DATABASE_URL","scope":"server","folder":null}]}' ;;
  shell) if [ "$2" = "--help" ]; then echo "Usage: relic shell [options]"; exit 0; fi ;;
  *) if [ "$2" = "--help" ]; then echo "  Usage  \\$ relic <command> [options]"; exit 0; fi
     echo "Unknown command: $1" >&2; exit 1 ;;
esac
`,
  );
  chmodSync(bin, 0o755);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("reads version, environments, and secret names via JSON commands only", async () => {
    const cli = new RelicCli(() => bin);
    expect(await cli.version()).toBe("0.10.0");

    const project = await cli.project("proj_1", dir);
    expect(project.environments.map((env) => env.name)).toEqual(["development"]);

    const names = await cli.secretNames("proj_1", "development", dir);
    expect(names.secrets).toEqual([{ name: "DATABASE_URL", scope: "server", folder: null }]);

    const calls = readFileSync(log, "utf8").trim().split("\n");
    expect(calls).toEqual([
      "--version",
      "projects --json --project proj_1",
      "secrets --json --project proj_1 -e development",
    ]);
    expect(calls.some((call) => call.startsWith("run"))).toBe(false);
  });

  test("detects command support from --help", async () => {
    const cli = new RelicCli(() => bin);
    expect(await cli.supports("shell")).toBe(true);
    expect(await cli.supports("teleport")).toBe(false);
  });

  test("reports a missing binary", async () => {
    const cli = new RelicCli(() => join(dir, "does-not-exist"));
    const error = await cli.version().catch((err: unknown) => err);
    expect((error as RelicCliError).kind).toBe("not_installed");
  });
});
