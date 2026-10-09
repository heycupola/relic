import { describe, expect, mock, test } from "bun:test";
import {
  type ApplyImportContext,
  applyImportPlan,
  buildImportPlan,
  canDeleteSource,
  decideImport,
  type ExistingSecret,
  formatImportPlan,
  ImportBatchError,
  type ImportPlan,
  type PlannedSecret,
  selectWrites,
} from "./import-plan";

const EXISTING: ExistingSecret[] = [
  { id: "s1", key: "SAME", scope: "server", valueType: "string", value: "same-value" },
  { id: "s2", key: "CHANGED", scope: "shared", valueType: "string", value: "old-value" },
];

function source(items: unknown[], extra: Partial<Parameters<typeof buildImportPlan>[0]> = {}) {
  return { items, skipped: [], invalidLines: [], ...extra };
}

function planned(key: string, existingId?: string): PlannedSecret {
  return { key, value: `${key}-value`, valueType: "string", scope: "shared", existingId };
}

function emptyPlan(overrides: Partial<ImportPlan> = {}): ImportPlan {
  return { create: [], overwrite: [], unchanged: [], skipped: [], invalid: [], ...overrides };
}

describe("buildImportPlan", () => {
  test("splits secrets into new, changed, and unchanged", () => {
    const plan = buildImportPlan(
      source([
        { key: "NEW_KEY", value: "n", type: "string" },
        { key: "SAME", value: "same-value", type: "string" },
        { key: "CHANGED", value: "new-value", type: "string" },
      ]),
      EXISTING,
    );

    expect(plan.create.map((s) => s.key)).toEqual(["NEW_KEY"]);
    expect(plan.unchanged.map((s) => s.key)).toEqual(["SAME"]);
    expect(plan.overwrite).toEqual([
      {
        key: "CHANGED",
        value: "new-value",
        valueType: "string",
        scope: "shared",
        existingId: "s2",
      },
    ]);
  });

  test("resolves scope from the entry, then --scope, then the existing secret", () => {
    const plan = buildImportPlan(
      source([
        { key: "EXPLICIT", value: "1", scope: "client" },
        { key: "SAME", value: "same-value", type: "string" },
        { key: "NEW_KEY", value: "x" },
      ]),
      EXISTING,
    );
    expect(plan.create.find((s) => s.key === "EXPLICIT")?.scope).toBe("client");
    expect(plan.unchanged.find((s) => s.key === "SAME")?.scope).toBe("server");
    expect(plan.create.find((s) => s.key === "NEW_KEY")?.scope).toBe("shared");

    const withDefault = buildImportPlan(
      source([
        { key: "EXPLICIT", value: "1", scope: "client" },
        { key: "SAME", value: "same-value", type: "string" },
      ]),
      EXISTING,
      "server",
    );
    expect(withDefault.create[0]?.scope).toBe("client");
    expect(withDefault.unchanged[0]?.scope).toBe("server");
  });

  test("treats a scope change as an overwrite", () => {
    const plan = buildImportPlan(
      source([{ key: "SAME", value: "same-value", type: "string", scope: "client" }]),
      EXISTING,
    );
    expect(plan.overwrite.map((s) => s.key)).toEqual(["SAME"]);
  });

  test("reports invalid keys, duplicates, and unparseable lines by name", () => {
    const plan = buildImportPlan(
      source(
        [
          { key: "my-key", value: "secret-1" },
          { key: "OK", value: "first" },
          { key: "OK", value: "second" },
          { key: "TOO_LONG", value: "x".repeat(10001) },
          { value: "orphan" },
        ],
        {
          invalidLines: [{ line: 7, message: "Expected KEY=value" }],
          skipped: [{ key: "STRIPE", reason: "Vercel sensitive value (not readable)" }],
        },
      ),
      [],
    );

    expect(plan.create.map((s) => s.key)).toEqual(["OK"]);
    expect(plan.create[0]?.value).toBe("first");
    expect(plan.skipped).toEqual([
      { key: "STRIPE", reason: "Vercel sensitive value (not readable)" },
    ]);
    expect(plan.invalid.map((i) => i.label)).toEqual([
      "line 7",
      "my-key",
      "OK",
      "TOO_LONG",
      "entry #5",
    ]);
    expect(plan.invalid[2]?.message).toBe("Duplicate key (first occurrence kept)");
  });

  test("stringifies number and boolean values", () => {
    const plan = buildImportPlan(source([{ key: "PORT", value: 3000 }]), []);
    expect(plan.create[0]).toMatchObject({ value: "3000", valueType: "number" });
  });
});

describe("decideImport", () => {
  const withConflicts = emptyPlan({ create: [planned("A")], overwrite: [planned("B", "s")] });
  const onlyNew = emptyPlan({ create: [planned("A")] });

  test("rejects conflicting flags", () => {
    expect(
      decideImport(onlyNew, { overwrite: true, skipExisting: true, interactive: true }).action,
    ).toBe("error");
  });

  test("asks how to handle conflicts interactively", () => {
    expect(decideImport(withConflicts, { interactive: true })).toEqual({
      action: "prompt-conflicts",
    });
  });

  test("requires an explicit choice for conflicts when non-interactive", () => {
    const decision = decideImport(withConflicts, { interactive: false, yes: true });
    expect(decision.action).toBe("error");
    expect(decision.action === "error" && decision.message).toContain("--overwrite");
  });

  test("uses explicit conflict flags", () => {
    expect(decideImport(withConflicts, { overwrite: true, interactive: false })).toEqual({
      action: "proceed",
      mode: "overwrite",
    });
    expect(decideImport(withConflicts, { skipExisting: true, interactive: false })).toEqual({
      action: "proceed",
      mode: "skip",
    });
  });

  test("confirms by default, unless --yes or non-interactive", () => {
    expect(decideImport(onlyNew, { interactive: true }).action).toBe("prompt-confirm");
    expect(decideImport(onlyNew, { interactive: true, yes: true }).action).toBe("proceed");
    expect(decideImport(onlyNew, { interactive: false }).action).toBe("proceed");
  });

  test("returns nothing when there is nothing to write", () => {
    expect(decideImport(emptyPlan({ unchanged: [planned("A")] }), { interactive: true })).toEqual({
      action: "nothing",
    });
    expect(
      decideImport(emptyPlan({ overwrite: [planned("B", "s")] }), {
        skipExisting: true,
        interactive: false,
      }),
    ).toEqual({ action: "nothing" });
  });
});

describe("selectWrites and canDeleteSource", () => {
  const plan = emptyPlan({ create: [planned("A")], overwrite: [planned("B", "s")] });

  test("includes overwrites only in overwrite mode", () => {
    expect(selectWrites(plan, "overwrite").map((s) => s.key)).toEqual(["A", "B"]);
    expect(selectWrites(plan, "skip").map((s) => s.key)).toEqual(["A"]);
  });

  test("only allows deleting the source when every entry landed in Relic", () => {
    expect(canDeleteSource(plan, "overwrite")).toBe(true);
    expect(canDeleteSource(plan, "skip")).toBe(false);
    expect(canDeleteSource({ ...plan, invalid: [{ label: "x", message: "" }] }, "overwrite")).toBe(
      false,
    );
    expect(canDeleteSource({ ...plan, skipped: [{ key: "x", reason: "" }] }, "overwrite")).toBe(
      false,
    );
  });
});

describe("applyImportPlan", () => {
  test("encrypts values and uploads in batches with overwrite mode", async () => {
    const encrypt = mock((value: string) => Promise.resolve(`enc(${value})`));
    const updateSecretBulk = mock((args: Parameters<ApplyImportContext["updateSecretBulk"]>[0]) =>
      Promise.resolve({
        success: true,
        createdCount: args.secrets.length,
        updatedCount: 0,
        skippedCount: 0,
        secretIds: [],
      }),
    );
    const progress: number[] = [];

    const writes = [planned("A"), planned("B", "s2"), planned("C")];
    const result = await applyImportPlan(writes, {
      environmentId: "env_1",
      folderId: "folder_1",
      encrypt,
      updateSecretBulk,
      batchSize: 2,
      onProgress: (written) => progress.push(written),
    });

    expect(result).toEqual({ created: 3, updated: 0 });
    expect(encrypt).toHaveBeenCalledTimes(3);
    expect(updateSecretBulk).toHaveBeenCalledTimes(2);
    expect(updateSecretBulk.mock.calls[0]?.[0]).toEqual({
      environmentId: "env_1",
      folderId: "folder_1",
      mode: "overwrite",
      secrets: [
        {
          secretId: undefined,
          key: "A",
          encryptedValue: "enc(A-value)",
          valueType: "string",
          scope: "shared",
        },
        {
          secretId: "s2",
          key: "B",
          encryptedValue: "enc(B-value)",
          valueType: "string",
          scope: "shared",
        },
      ],
    });
    expect(JSON.stringify(updateSecretBulk.mock.calls)).not.toContain('"A-value"');
    expect(progress).toEqual([2, 3]);
  });

  test("reports how many secrets were written before a failure", async () => {
    let calls = 0;
    const updateSecretBulk = mock(() => {
      calls++;
      if (calls === 2) return Promise.reject(new Error("rate limited"));
      return Promise.resolve({
        success: true,
        createdCount: 1,
        updatedCount: 0,
        skippedCount: 0,
        secretIds: [],
      });
    });

    const error = await applyImportPlan([planned("A"), planned("B")], {
      environmentId: "env_1",
      encrypt: (v) => Promise.resolve(v),
      updateSecretBulk,
      batchSize: 1,
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ImportBatchError);
    expect(error.written).toBe(1);
    expect(error.message).toBe("Import stopped after 1 of 2 secrets");
    expect(error.cause.message).toBe("rate limited");
  });
});

describe("formatImportPlan", () => {
  test("lists names and never values", () => {
    const plan = buildImportPlan(
      source(
        [
          { key: "NEW_KEY", value: "plaintext-new" },
          { key: "CHANGED", value: "plaintext-changed" },
          { key: "SAME", value: "same-value", type: "string" },
          { key: "bad-key", value: "plaintext-bad" },
        ],
        { skipped: [{ key: "SENSITIVE", reason: "Vercel sensitive value (not readable)" }] },
      ),
      EXISTING,
    );

    const output = formatImportPlan(plan, "overwrite").join("\n");
    for (const key of ["NEW_KEY", "CHANGED", "SAME", "bad-key", "SENSITIVE"]) {
      expect(output).toContain(key);
    }
    expect(output).toContain("will be overwritten");
    expect(output).not.toContain("plaintext");
    expect(output).not.toContain("same-value");
  });
});
