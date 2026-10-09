import { describe, expect, test } from "bun:test";
import type { ServiceAccount } from "../lib/api";
import { resolveExpiresAt, resolveOidcArgs, selectServiceAccountToRevoke } from "./service-account";

const DAY_MS = 24 * 60 * 60 * 1000;

function account(overrides: Partial<ServiceAccount>): ServiceAccount {
  return {
    id: "sa_1",
    name: "deploy",
    publicKey: "pk",
    tokenPrefix: "rsk_abc",
    createdAt: 0,
    ...overrides,
  };
}

describe("resolveOidcArgs", () => {
  test("accepts GitLab subgroups", () => {
    const args = resolveOidcArgs({ gitlab: "group/sub/project", branch: "main" });
    expect(args.oidcSubjectPattern).toBe("project_path:group/sub/project:ref_type:branch:ref:main");
  });

  test("rejects malformed GitLab paths", () => {
    expect(() => resolveOidcArgs({ gitlab: "group" })).toThrow("--gitlab");
    expect(() => resolveOidcArgs({ gitlab: "group//project" })).toThrow("--gitlab");
  });

  test("GitHub requires exactly org/repo", () => {
    expect(resolveOidcArgs({ github: "org/repo" }).oidcSubjectPattern).toBe("repo:org/repo:*");
    expect(() => resolveOidcArgs({ github: "org/repo/extra" })).toThrow("--github");
  });

  test("--branch without a provider is an error", () => {
    expect(() => resolveOidcArgs({ branch: "main" })).toThrow("--branch");
    expect(() => resolveOidcArgs({ branch: "main", oidcIssuer: "https://x" })).toThrow("--branch");
  });
});

describe("resolveExpiresAt", () => {
  test("accepts whole days between 1 and 365", () => {
    expect(resolveExpiresAt("1", 0)).toBe(DAY_MS);
    expect(resolveExpiresAt("365", 0)).toBe(365 * DAY_MS);
    expect(resolveExpiresAt(undefined)).toBeUndefined();
  });

  test.each(["0", "366", "10abc", "1.5", "-3", "", "abc"])("rejects %p", (value) => {
    expect(() => resolveExpiresAt(value)).toThrow("--expires-in");
  });
});

describe("selectServiceAccountToRevoke", () => {
  test("prefers the active account over revoked ones with the same name", () => {
    const accounts = [account({ id: "old", revokedAt: 1 }), account({ id: "current" })];
    expect(selectServiceAccountToRevoke(accounts, { name: "deploy" }).id).toBe("current");
  });

  test("errors on ambiguity and lists the ids", () => {
    const accounts = [account({ id: "a" }), account({ id: "b" })];
    expect(() => selectServiceAccountToRevoke(accounts, { name: "deploy" })).toThrow(/a .*b /);
  });

  test("selects by id", () => {
    const accounts = [account({ id: "a" }), account({ id: "b" })];
    expect(selectServiceAccountToRevoke(accounts, { id: "b" }).id).toBe("b");
  });

  test("reports already revoked and missing accounts", () => {
    const accounts = [account({ id: "a", revokedAt: 1 })];
    expect(() => selectServiceAccountToRevoke(accounts, { name: "deploy" })).toThrow(
      "already revoked",
    );
    expect(() => selectServiceAccountToRevoke(accounts, { name: "other" })).toThrow("not found");
  });
});
