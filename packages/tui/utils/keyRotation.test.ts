import { describe, expect, test } from "bun:test";
import {
  createProjectKey,
  createServiceAccountKeys,
  createUserKeys,
  decryptPrivateKeyWithPassword,
  decryptSecret,
  encryptSecret,
  unwrapAESKeyWithRSA,
  unwrapProjectKeyWithServiceToken,
} from "@repo/crypto";
import { buildRotationPayload } from "./keyRotation";

const PASSWORD = "correct horse battery staple";
const SA_TOKEN = "relic_sa_test_token";

async function makeUser() {
  const keys = await createUserKeys(PASSWORD);
  const privateKey = await decryptPrivateKeyWithPassword(
    keys.encryptedPrivateKey,
    PASSWORD,
    keys.salt,
  );
  return { publicKey: keys.publicKey, privateKey };
}

async function setup() {
  const [owner, alice, bob, sa, revokedSa] = await Promise.all([
    makeUser(),
    makeUser(),
    makeUser(),
    createServiceAccountKeys(SA_TOKEN),
    createServiceAccountKeys(SA_TOKEN),
  ]);
  const { projectKey } = await createProjectKey(owner.publicKey);
  const secrets = [
    { id: "s1", encryptedValue: await encryptSecret(projectKey, "postgres://db") },
    { id: "s2", encryptedValue: await encryptSecret(projectKey, "sk_live_123") },
  ];
  return { owner, alice, bob, sa, revokedSa, projectKey, secrets };
}

describe("buildRotationPayload", () => {
  test("rewraps remaining shares and active service accounts with a fresh key", async () => {
    const { owner, alice, bob, sa, revokedSa, projectKey, secrets } = await setup();

    const payload = await buildRotationPayload({
      revokedShareId: "share-bob",
      currentProjectKey: projectKey,
      ownerPublicKey: owner.publicKey,
      shares: [
        { id: "share-alice", email: "alice@example.com", publicKey: alice.publicKey },
        { id: "share-bob", email: "bob@example.com", publicKey: bob.publicKey },
      ],
      serviceAccounts: [
        { id: "sa-active", name: "ci", publicKey: sa.publicKey },
        { id: "sa-revoked", name: "old", publicKey: revokedSa.publicKey, revokedAt: 1 },
      ],
      secrets,
    });

    expect(payload.rewrappedShares.map((s) => s.shareId)).toEqual(["share-alice"]);
    expect(payload.rewrappedServiceAccounts.map((s) => s.serviceAccountId)).toEqual(["sa-active"]);
    expect(payload.reEncryptedSecrets.map((s) => s.secretId)).toEqual(["s1", "s2"]);

    const ownerKey = await unwrapAESKeyWithRSA(payload.newEncryptedProjectKey, owner.privateKey);
    const aliceKey = await unwrapAESKeyWithRSA(
      payload.rewrappedShares[0]!.newEncryptedProjectKey,
      alice.privateKey,
    );
    const saKey = await unwrapProjectKeyWithServiceToken(
      payload.rewrappedServiceAccounts[0]!.newEncryptedProjectKey,
      sa.encryptedPrivateKey,
      SA_TOKEN,
      sa.salt,
    );

    for (const key of [ownerKey, aliceKey, saKey]) {
      const values = await Promise.all(
        payload.reEncryptedSecrets.map((s) => decryptSecret(key, s.newEncryptedValue)),
      );
      expect(values).toEqual(["postgres://db", "sk_live_123"]);
    }

    await expect(
      decryptSecret(projectKey, payload.reEncryptedSecrets[0]!.newEncryptedValue),
    ).rejects.toThrow();
  });

  test("refuses to rotate when a remaining collaborator has no public key", async () => {
    const { owner, alice, projectKey, secrets } = await setup();

    await expect(
      buildRotationPayload({
        revokedShareId: "share-alice",
        currentProjectKey: projectKey,
        ownerPublicKey: owner.publicKey,
        shares: [
          { id: "share-alice", email: "alice@example.com", publicKey: alice.publicKey },
          { id: "share-carol", email: "carol@example.com", publicKey: null },
          { id: "share-dave", email: "dave@example.com", publicKey: null },
        ],
        serviceAccounts: [],
        secrets,
      }),
    ).rejects.toThrow(
      "Cannot rotate keys: carol@example.com, dave@example.com have no encryption keys yet.",
    );
  });

  test("ignores a missing public key on the share being revoked", async () => {
    const { owner, projectKey } = await setup();

    const payload = await buildRotationPayload({
      revokedShareId: "share-carol",
      currentProjectKey: projectKey,
      ownerPublicKey: owner.publicKey,
      shares: [{ id: "share-carol", email: "carol@example.com", publicKey: null }],
      serviceAccounts: [],
      secrets: [],
    });

    expect(payload.rewrappedShares).toEqual([]);
    expect(payload.reEncryptedSecrets).toEqual([]);
  });
});
