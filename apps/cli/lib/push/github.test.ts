import { describe, expect, test } from "bun:test";
import { GitHubActionsAdapter, githubAdapterFactory } from "./github";
import { createFakeDeps, fail, ok } from "./test-helpers";
import { PlatformAuthError, PushUsageError } from "./types";

const GH = "/usr/local/bin/gh";
const BASE_OPTIONS = { environment: "production", target: "github" };

describe("githubAdapterFactory", () => {
  test("detects the current repository", async () => {
    const { deps, execCalls } = createFakeDeps({
      binaries: { gh: GH },
      exec: (call) => (call.args[0] === "repo" ? ok("acme/web\n") : ok()),
    });
    const adapter = await githubAdapterFactory.create(BASE_OPTIONS, deps);
    expect(adapter.destination).toBe("acme/web");
    expect(adapter.productionLike).toBe(true);
    expect(execCalls.map((c) => c.args[0])).toEqual(["auth", "repo"]);
  });

  test("uses environment-level secrets when --github-env is set", async () => {
    const { deps } = createFakeDeps({ binaries: { gh: GH } });
    const adapter = await githubAdapterFactory.create(
      { ...BASE_OPTIONS, githubRepo: "acme/web", githubEnv: "staging" },
      deps,
    );
    expect(adapter.destination).toBe("acme/web (environment: staging)");
    expect(adapter.productionLike).toBe(false);
  });

  test("tells the user to run gh auth login", async () => {
    const { deps } = createFakeDeps({
      binaries: { gh: GH },
      exec: () => fail("You are not logged into any GitHub hosts."),
    });
    const err = await githubAdapterFactory.create(BASE_OPTIONS, deps).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("gh auth login");
  });

  test("explains how to install gh when it is missing", async () => {
    const err = await githubAdapterFactory
      .create(BASE_OPTIONS, createFakeDeps().deps)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PlatformAuthError);
    expect(err.hint).toContain("cli.github.com");
  });

  test("rejects malformed repositories", async () => {
    const { deps } = createFakeDeps({ binaries: { gh: GH } });
    const err = await githubAdapterFactory
      .create({ ...BASE_OPTIONS, githubRepo: "not a repo" }, deps)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PushUsageError);
  });
});

describe("GitHubActionsAdapter", () => {
  test("sets each secret through stdin so values never appear in argv", async () => {
    const { deps, execCalls } = createFakeDeps();
    const adapter = new GitHubActionsAdapter(deps, GH, "acme/web", "production");

    await adapter.upsert({ API_KEY: "k-123", DB_URL: "postgres://db" });

    expect(execCalls).toEqual([
      {
        command: GH,
        args: ["secret", "set", "API_KEY", "--repo", "acme/web", "--env", "production"],
        options: { input: "k-123" },
      },
      {
        command: GH,
        args: ["secret", "set", "DB_URL", "--repo", "acme/web", "--env", "production"],
        options: { input: "postgres://db" },
      },
    ]);
  });

  test("lists and deletes secrets", async () => {
    const { deps, execCalls } = createFakeDeps({
      exec: (call) => (call.args[1] === "list" ? ok('[{"name":"A"},{"name":"B"}]') : ok()),
    });
    const adapter = new GitHubActionsAdapter(deps, GH, "acme/web", undefined);

    expect(await adapter.list()).toEqual([{ name: "A" }, { name: "B" }]);
    await adapter.delete(["B"]);

    expect(execCalls.map((c) => c.args)).toEqual([
      ["secret", "list", "--json", "name", "--repo", "acme/web"],
      ["secret", "delete", "B", "--repo", "acme/web"],
    ]);
  });

  test("reports the names that failed to set", async () => {
    const { deps } = createFakeDeps({
      exec: (call) => (call.args[2] === "B" ? fail("HTTP 422") : ok()),
    });
    const adapter = new GitHubActionsAdapter(deps, GH, "acme/web", undefined);
    await expect(adapter.upsert({ A: "value-a", B: "value-b" })).rejects.toThrow(
      "gh failed to set: B",
    );
  });

  test("validates names and values without echoing values", () => {
    const adapter = new GitHubActionsAdapter(createFakeDeps().deps, GH, "acme/web", undefined);
    const problems = adapter.validate({
      GITHUB_TOKEN: "abc",
      "my-key": "abc",
      EMPTY: "",
      OK_NAME: "fine",
    });
    expect(problems).toEqual([
      "GITHUB_TOKEN: GitHub secret names cannot start with GITHUB_",
      "my-key: GitHub secret names may only contain letters, digits, and underscores",
      "EMPTY: GitHub does not accept empty secret values",
    ]);
  });
});
