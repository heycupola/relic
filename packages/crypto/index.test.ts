import { describe, expect, test } from "bun:test";
import {
  CryptoError,
  createProjectKey,
  createServiceAccountKeys,
  createUserKeys,
  decryptPrivateKeyWithPassword,
  decryptSecret,
  decryptServiceAccountPrivateKey,
  decryptWithAES,
  decryptWithRSA,
  deriveKeyFromPassword,
  deriveKeyFromToken,
  encryptPrivateKeyWithPassword,
  encryptSecret,
  encryptWithAES,
  encryptWithRSA,
  exportPrivateKey,
  exportPublicKey,
  generateAESKey,
  generateIV,
  generateRSAKeyPair,
  generateSalt,
  importPrivateKey,
  importPublicKey,
  unwrapAESKeyWithRSA,
  unwrapProjectKey,
  unwrapProjectKeyWithServiceToken,
  wrapAESKeyWithRSA,
} from "./index";

describe("CryptoError", () => {
  test("should create error with code and message", () => {
    const error = new CryptoError("INVALID_INPUT", "Test error message");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CryptoError);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe("Test error message");
    expect(error.name).toBe("CryptoError");
  });

  test("should include cause when provided", () => {
    const cause = new Error("Original error");
    const error = new CryptoError("ENCRYPTION_FAILED", "Wrapped error", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("Key Generation", () => {
  test("generateRSAKeyPair should create valid key pair", async () => {
    const keyPair = await generateRSAKeyPair();

    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey.type).toBe("public");
    expect(keyPair.privateKey.type).toBe("private");
    expect(keyPair.publicKey.algorithm.name).toBe("RSA-OAEP");
    expect(keyPair.privateKey.algorithm.name).toBe("RSA-OAEP");
  });

  test("generateAESKey should create valid AES key", async () => {
    const key = await generateAESKey();

    expect(key).toBeDefined();
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
  });

  test("generateSalt should create 16-byte base64 salt", () => {
    const salt = generateSalt();

    expect(salt).toBeDefined();
    expect(typeof salt).toBe("string");
    expect(salt.length).toBeGreaterThanOrEqual(22);
  });

  test("generateSalt should create unique salts", () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).not.toBe(salt2);
  });

  test("generateIV should create 12-byte IV", () => {
    const iv = generateIV();

    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(12);
  });

  test("generateIV should create unique IVs", () => {
    const iv1 = generateIV();
    const iv2 = generateIV();

    expect(Buffer.from(iv1).toString("hex")).not.toBe(Buffer.from(iv2).toString("hex"));
  });
});

describe("Key Derivation", () => {
  test("deriveKeyFromPassword should derive consistent key", async () => {
    const password = "test-password-123";
    const salt = generateSalt();

    const key1 = await deriveKeyFromPassword(password, salt);
    const key2 = await deriveKeyFromPassword(password, salt);

    const testData = "test-data-for-key-consistency";
    const encrypted = await encryptWithAES(key1, testData);
    const decrypted = await decryptWithAES(key2, encrypted);

    expect(decrypted).toBe(testData);
  });

  test("deriveKeyFromPassword should derive different keys for different passwords", async () => {
    const salt = generateSalt();

    const key1 = await deriveKeyFromPassword("password1", salt);
    const key2 = await deriveKeyFromPassword("password2", salt);

    const testData = "test-data";
    const encrypted = await encryptWithAES(key1, testData);

    expect(decryptWithAES(key2, encrypted)).rejects.toThrow();
  });

  test("deriveKeyFromPassword should derive different keys for different salts", async () => {
    const password = "same-password";

    const key1 = await deriveKeyFromPassword(password, generateSalt());
    const key2 = await deriveKeyFromPassword(password, generateSalt());

    const testData = "test-data";
    const encrypted = await encryptWithAES(key1, testData);

    expect(decryptWithAES(key2, encrypted)).rejects.toThrow();
  });

  test("deriveKeyFromPassword should throw on empty password", async () => {
    const salt = generateSalt();

    expect(deriveKeyFromPassword("", salt)).rejects.toThrow(CryptoError);
  });

  test("deriveKeyFromPassword should throw on empty salt", async () => {
    expect(deriveKeyFromPassword("password", "")).rejects.toThrow(CryptoError);
  });
});

describe("Key Export/Import", () => {
  test("should export and import public key", async () => {
    const { publicKey } = await generateRSAKeyPair();

    const exported = await exportPublicKey(publicKey);
    expect(typeof exported).toBe("string");
    expect(exported.length).toBeGreaterThan(0);

    const imported = await importPublicKey(exported);
    expect(imported.type).toBe("public");
    expect(imported.algorithm.name).toBe("RSA-OAEP");
  });

  test("should export and import private key", async () => {
    const { privateKey } = await generateRSAKeyPair();

    const exported = await exportPrivateKey(privateKey);
    expect(typeof exported).toBe("string");
    expect(exported.length).toBeGreaterThan(0);

    const imported = await importPrivateKey(exported);
    expect(imported.type).toBe("private");
    expect(imported.algorithm.name).toBe("RSA-OAEP");
  });

  test("importPublicKey should throw on empty input", async () => {
    expect(importPublicKey("")).rejects.toThrow(CryptoError);
  });

  test("importPrivateKey should throw on empty input", async () => {
    expect(importPrivateKey("")).rejects.toThrow(CryptoError);
  });

  test("importPublicKey should throw on invalid base64", async () => {
    expect(importPublicKey("not!valid@base64")).rejects.toThrow(CryptoError);
  });
});

describe("RSA Encryption", () => {
  test("should encrypt and decrypt with RSA", async () => {
    const { publicKey, privateKey } = await generateRSAKeyPair();
    const plaintext = "Hello, RSA!";

    const encrypted = await encryptWithRSA(publicKey, plaintext);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptWithRSA(privateKey, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("should encrypt maximum size message (190 bytes)", async () => {
    const { publicKey, privateKey } = await generateRSAKeyPair();
    const plaintext = "a".repeat(190);

    const encrypted = await encryptWithRSA(publicKey, plaintext);
    const decrypted = await decryptWithRSA(privateKey, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test("should throw on message exceeding 190 bytes", async () => {
    const { publicKey } = await generateRSAKeyPair();
    const plaintext = "a".repeat(191);

    expect(encryptWithRSA(publicKey, plaintext)).rejects.toThrow(CryptoError);
  });

  test("should throw on empty data", async () => {
    const { publicKey } = await generateRSAKeyPair();

    expect(encryptWithRSA(publicKey, "")).rejects.toThrow(CryptoError);
  });

  test("decryptWithRSA should throw on empty input", async () => {
    const { privateKey } = await generateRSAKeyPair();

    expect(decryptWithRSA(privateKey, "")).rejects.toThrow(CryptoError);
  });

  test("decryptWithRSA should throw on wrong key", async () => {
    const keyPair1 = await generateRSAKeyPair();
    const keyPair2 = await generateRSAKeyPair();

    const encrypted = await encryptWithRSA(keyPair1.publicKey, "test");

    expect(decryptWithRSA(keyPair2.privateKey, encrypted)).rejects.toThrow(CryptoError);
  });
});

describe("AES Encryption", () => {
  test("should encrypt and decrypt with AES", async () => {
    const key = await generateAESKey();
    const plaintext = "Hello, AES-GCM!";

    const encrypted = await encryptWithAES(key, plaintext);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptWithAES(key, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("should handle large data", async () => {
    const key = await generateAESKey();
    const plaintext = "x".repeat(100000); // 100KB

    const encrypted = await encryptWithAES(key, plaintext);
    const decrypted = await decryptWithAES(key, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test("should handle unicode data", async () => {
    const key = await generateAESKey();
    const plaintext = "Hello, 世界! 🔐🔑";

    const encrypted = await encryptWithAES(key, plaintext);
    const decrypted = await decryptWithAES(key, encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test("should produce different ciphertext each time (random IV)", async () => {
    const key = await generateAESKey();
    const plaintext = "Same message";

    const encrypted1 = await encryptWithAES(key, plaintext);
    const encrypted2 = await encryptWithAES(key, plaintext);

    expect(encrypted1).not.toBe(encrypted2);
  });

  test("should throw on empty data", async () => {
    const key = await generateAESKey();

    expect(encryptWithAES(key, "")).rejects.toThrow(CryptoError);
  });

  test("should throw on empty encrypted data", async () => {
    const key = await generateAESKey();

    expect(decryptWithAES(key, "")).rejects.toThrow(CryptoError);
  });

  test("should throw on ciphertext too short", async () => {
    const key = await generateAESKey();
    const shortCiphertext = Buffer.from(new Uint8Array(10)).toString("base64");

    expect(decryptWithAES(key, shortCiphertext)).rejects.toThrow(CryptoError);
  });

  test("should throw on wrong key", async () => {
    const key1 = await generateAESKey();
    const key2 = await generateAESKey();

    const encrypted = await encryptWithAES(key1, "test");

    expect(decryptWithAES(key2, encrypted)).rejects.toThrow(CryptoError);
  });
});

describe("Key Wrapping", () => {
  test("should wrap and unwrap AES key with RSA", async () => {
    const { publicKey, privateKey } = await generateRSAKeyPair();
    const aesKey = await generateAESKey();

    const wrapped = await wrapAESKeyWithRSA(aesKey, publicKey);
    expect(typeof wrapped).toBe("string");

    const unwrapped = await unwrapAESKeyWithRSA(wrapped, privateKey);
    expect(unwrapped.type).toBe("secret");
    expect(unwrapped.algorithm.name).toBe("AES-GCM");

    const plaintext = "test encryption";
    const encrypted = await encryptWithAES(aesKey, plaintext);
    const decrypted = await decryptWithAES(unwrapped, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test("unwrapAESKeyWithRSA should throw on empty input", async () => {
    const { privateKey } = await generateRSAKeyPair();

    expect(unwrapAESKeyWithRSA("", privateKey)).rejects.toThrow(CryptoError);
  });

  test("unwrapAESKeyWithRSA should throw on wrong key", async () => {
    const keyPair1 = await generateRSAKeyPair();
    const keyPair2 = await generateRSAKeyPair();
    const aesKey = await generateAESKey();

    const wrapped = await wrapAESKeyWithRSA(aesKey, keyPair1.publicKey);

    expect(unwrapAESKeyWithRSA(wrapped, keyPair2.privateKey)).rejects.toThrow(CryptoError);
  });
});

describe("Private Key Encryption", () => {
  test("should encrypt and decrypt private key with password", async () => {
    const { privateKey } = await generateRSAKeyPair();
    const password = "secure-password-123";
    const salt = generateSalt();

    const encrypted = await encryptPrivateKeyWithPassword(privateKey, password, salt);
    expect(typeof encrypted).toBe("string");

    const decrypted = await decryptPrivateKeyWithPassword(encrypted, password, salt);
    expect(decrypted.type).toBe("private");
    expect(decrypted.algorithm.name).toBe("RSA-OAEP");
  });

  test("should throw on wrong password", async () => {
    const { privateKey } = await generateRSAKeyPair();
    const salt = generateSalt();

    const encrypted = await encryptPrivateKeyWithPassword(privateKey, "correct-password", salt);

    expect(decryptPrivateKeyWithPassword(encrypted, "wrong-password", salt)).rejects.toThrow(
      CryptoError,
    );
  });

  test("should throw on empty inputs", async () => {
    const { privateKey } = await generateRSAKeyPair();
    const salt = generateSalt();

    expect(encryptPrivateKeyWithPassword(privateKey, "", salt)).rejects.toThrow(CryptoError);
    expect(encryptPrivateKeyWithPassword(privateKey, "password", "")).rejects.toThrow(CryptoError);
  });
});

describe("High-level API", () => {
  describe("createUserKeys", () => {
    test("should create complete user key set", async () => {
      const keys = await createUserKeys("user-password");

      expect(keys.publicKey).toBeDefined();
      expect(keys.encryptedPrivateKey).toBeDefined();
      expect(keys.salt).toBeDefined();

      expect(typeof keys.publicKey).toBe("string");
      expect(typeof keys.encryptedPrivateKey).toBe("string");
      expect(typeof keys.salt).toBe("string");
    });

    test("should throw on empty password", async () => {
      expect(createUserKeys("")).rejects.toThrow(CryptoError);
    });

    test("created keys should be usable", async () => {
      const password = "test-password";
      const keys = await createUserKeys(password);

      const privateKey = await decryptPrivateKeyWithPassword(
        keys.encryptedPrivateKey,
        password,
        keys.salt,
      );
      expect(privateKey.type).toBe("private");

      const publicKey = await importPublicKey(keys.publicKey);
      expect(publicKey.type).toBe("public");

      const encrypted = await encryptWithRSA(publicKey, "test");
      const decrypted = await decryptWithRSA(privateKey, encrypted);
      expect(decrypted).toBe("test");
    });
  });

  describe("createProjectKey", () => {
    test("should create project key and encrypted form", async () => {
      const userKeys = await createUserKeys("password");

      const { projectKey, encryptedProjectKey } = await createProjectKey(userKeys.publicKey);

      expect(projectKey).toBeDefined();
      expect(projectKey.type).toBe("secret");
      expect(encryptedProjectKey).toBeDefined();
      expect(typeof encryptedProjectKey).toBe("string");
    });

    test("should throw on empty public key", async () => {
      expect(createProjectKey("")).rejects.toThrow(CryptoError);
    });
  });

  describe("unwrapProjectKey", () => {
    test("should unwrap project key with user credentials", async () => {
      const password = "user-password";
      const userKeys = await createUserKeys(password);
      const { projectKey, encryptedProjectKey } = await createProjectKey(userKeys.publicKey);

      const unwrapped = await unwrapProjectKey(
        encryptedProjectKey,
        userKeys.encryptedPrivateKey,
        password,
        userKeys.salt,
      );

      const plaintext = "secret data";
      const encrypted = await encryptWithAES(projectKey, plaintext);
      const decrypted = await decryptWithAES(unwrapped, encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test("should throw on wrong password", async () => {
      const userKeys = await createUserKeys("correct-password");
      const { encryptedProjectKey } = await createProjectKey(userKeys.publicKey);

      expect(
        unwrapProjectKey(
          encryptedProjectKey,
          userKeys.encryptedPrivateKey,
          "wrong-password",
          userKeys.salt,
        ),
      ).rejects.toThrow(CryptoError);
    });
  });

  describe("encryptSecret/decryptSecret", () => {
    test("should encrypt and decrypt secrets", async () => {
      const password = "user-password";
      const userKeys = await createUserKeys(password);
      const { projectKey } = await createProjectKey(userKeys.publicKey);

      const secret = "API_KEY=super-secret-value-123";

      const encrypted = await encryptSecret(projectKey, secret);
      expect(encrypted).not.toBe(secret);

      const decrypted = await decryptSecret(projectKey, encrypted);
      expect(decrypted).toBe(secret);
    });

    test("should throw on empty secret", async () => {
      const { projectKey } = await createProjectKey((await createUserKeys("password")).publicKey);

      expect(encryptSecret(projectKey, "")).rejects.toThrow(CryptoError);
    });
  });
});

describe("Full E2E Flow", () => {
  test("complete secrets management workflow", async () => {
    const userPassword = "my-secure-password";
    const userKeys = await createUserKeys(userPassword);

    const { projectKey, encryptedProjectKey } = await createProjectKey(userKeys.publicKey);

    const secrets = {
      DATABASE_URL: "postgresql://localhost:5432/mydb",
      API_KEY: "sk_live_abc123xyz",
      JWT_SECRET: "super-secret-jwt-key-that-is-very-long",
    };

    const encryptedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      encryptedSecrets[key] = await encryptSecret(projectKey, value);
    }

    const recoveredProjectKey = await unwrapProjectKey(
      encryptedProjectKey,
      userKeys.encryptedPrivateKey,
      userPassword,
      userKeys.salt,
    );

    const decryptedSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(encryptedSecrets)) {
      decryptedSecrets[key] = await decryptSecret(recoveredProjectKey, value);
    }

    expect(decryptedSecrets).toEqual(secrets);
  });
});

describe("Edge Cases", () => {
  describe("Base64 Validation", () => {
    test("should throw on whitespace-only base64 input", async () => {
      const { privateKey } = await generateRSAKeyPair();

      expect(decryptWithRSA(privateKey, "   ")).rejects.toThrow(CryptoError);
      expect(decryptWithRSA(privateKey, "\t\n")).rejects.toThrow(CryptoError);
    });

    test("should throw on base64 with invalid characters", async () => {
      const key = await generateAESKey();

      expect(decryptWithAES(key, "invalid!base64@string")).rejects.toThrow(CryptoError);
      expect(decryptWithAES(key, "abc$def%ghi")).rejects.toThrow(CryptoError);
    });

    test("should throw on base64 with incorrect padding", async () => {
      const key = await generateAESKey();

      expect(decryptWithAES(key, "YWJj===")).rejects.toThrow(CryptoError);
    });

    test("should handle valid base64 with padding", async () => {
      const key = await generateAESKey();
      const plaintext = "test";

      const encrypted = await encryptWithAES(key, plaintext);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);

      const decrypted = await decryptWithAES(key, encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe("Performance", () => {
  test("should handle 100KB+ data encryption efficiently", async () => {
    const key = await generateAESKey();
    const largeData = "x".repeat(100 * 1024);

    const startEncrypt = performance.now();
    const encrypted = await encryptWithAES(key, largeData);
    const encryptTime = performance.now() - startEncrypt;

    const startDecrypt = performance.now();
    const decrypted = await decryptWithAES(key, encrypted);
    const decryptTime = performance.now() - startDecrypt;

    expect(decrypted).toBe(largeData);
    expect(encryptTime).toBeLessThan(100);
    expect(decryptTime).toBeLessThan(100);
  });

  test("should handle 1MB data encryption", async () => {
    const key = await generateAESKey();
    const largeData = "y".repeat(1024 * 1024);

    const startEncrypt = performance.now();
    const encrypted = await encryptWithAES(key, largeData);
    const encryptTime = performance.now() - startEncrypt;

    const startDecrypt = performance.now();
    const decrypted = await decryptWithAES(key, encrypted);
    const decryptTime = performance.now() - startDecrypt;

    expect(decrypted).toBe(largeData);
    expect(encryptTime).toBeLessThan(500);
    expect(decryptTime).toBeLessThan(500);
  });
});

describe("Concurrency", () => {
  test("should handle concurrent AES encryptions", async () => {
    const key = await generateAESKey();
    const secrets = Array.from({ length: 50 }, (_, i) => `secret-value-${i}`);

    const encryptedPromises = secrets.map((secret) => encryptWithAES(key, secret));
    const encrypted = await Promise.all(encryptedPromises);

    expect(encrypted.length).toBe(50);

    const uniqueEncrypted = new Set(encrypted);
    expect(uniqueEncrypted.size).toBe(50);

    const decryptedPromises = encrypted.map((enc) => decryptWithAES(key, enc));
    const decrypted = await Promise.all(decryptedPromises);

    expect(decrypted).toEqual(secrets);
  });

  test("should handle concurrent key derivations", async () => {
    const passwords = Array.from({ length: 5 }, (_, i) => `password-${i}`);
    const salts = passwords.map(() => generateSalt());

    // Derive keys concurrently
    const keyPromises = passwords.map((password, i) =>
      deriveKeyFromPassword(password, salts[i] as string),
    );
    const keys = await Promise.all(keyPromises);

    expect(keys.length).toBe(5);

    const testData = "test";
    for (const key of keys) {
      const encrypted = await encryptWithAES(key, testData);
      const decrypted = await decryptWithAES(key, encrypted);
      expect(decrypted).toBe(testData);
    }
  });

  test("should handle concurrent RSA operations", async () => {
    const { publicKey, privateKey } = await generateRSAKeyPair();
    const messages = Array.from({ length: 20 }, (_, i) => `message-${i}`);

    const encryptedPromises = messages.map((msg) => encryptWithRSA(publicKey, msg));
    const encrypted = await Promise.all(encryptedPromises);

    const decryptedPromises = encrypted.map((enc) => decryptWithRSA(privateKey, enc));
    const decrypted = await Promise.all(decryptedPromises);

    expect(decrypted).toEqual(messages);
  });

  test("should handle concurrent full workflow operations", async () => {
    const userKeys = await createUserKeys("test-password");
    const { projectKey } = await createProjectKey(userKeys.publicKey);

    const secrets = Array.from({ length: 100 }, (_, i) => ({
      key: `SECRET_${i}`,
      value: `value-${i}-${"x".repeat(100)}`,
    }));

    const encryptedPromises = secrets.map((s) => encryptSecret(projectKey, s.value));
    const encryptedValues = await Promise.all(encryptedPromises);

    const decryptedPromises = encryptedValues.map((enc) => decryptSecret(projectKey, enc));
    const decryptedValues = await Promise.all(decryptedPromises);

    expect(decryptedValues).toEqual(secrets.map((s) => s.value));
  });
});

describe("Service Account Key Derivation", () => {
  test("deriveKeyFromToken should produce a valid AES key", async () => {
    const token = "rsk_" + "a".repeat(64);
    const salt = generateSalt();
    const key = await deriveKeyFromToken(token, salt);
    expect(key).toBeDefined();
    expect(key.type).toBe("secret");

    const data = "test-data";
    const encrypted = await encryptWithAES(key, data);
    expect(encrypted).not.toBe(data);
  });

  test("same token and salt should derive the same key", async () => {
    const token = "rsk_" + "b".repeat(64);
    const salt = generateSalt();
    const key1 = await deriveKeyFromToken(token, salt);
    const key2 = await deriveKeyFromToken(token, salt);

    const data = "deterministic-test";
    const encrypted = await encryptWithAES(key1, data);
    const decrypted = await decryptWithAES(key2, encrypted);
    expect(decrypted).toBe(data);
  });

  test("different tokens should derive different keys", async () => {
    const salt = generateSalt();
    const key1 = await deriveKeyFromToken("rsk_token_one", salt);
    const key2 = await deriveKeyFromToken("rsk_token_two", salt);

    const data = "cross-key-test";
    const encrypted = await encryptWithAES(key1, data);
    await expect(decryptWithAES(key2, encrypted)).rejects.toThrow();
  });

  test("different salts should derive different keys", async () => {
    const token = "rsk_same_token";
    const key1 = await deriveKeyFromToken(token, generateSalt());
    const key2 = await deriveKeyFromToken(token, generateSalt());

    const data = "cross-salt-test";
    const encrypted = await encryptWithAES(key1, data);
    await expect(decryptWithAES(key2, encrypted)).rejects.toThrow();
  });

  test("should reject empty token", async () => {
    await expect(deriveKeyFromToken("", generateSalt())).rejects.toThrow(CryptoError);
  });

  test("should reject empty salt", async () => {
    await expect(deriveKeyFromToken("rsk_test", "")).rejects.toThrow(CryptoError);
  });
});

describe("Service Account Keys", () => {
  test("createServiceAccountKeys should return valid key pair", async () => {
    const token = "rsk_" + "c".repeat(64);
    const keys = await createServiceAccountKeys(token);

    expect(keys.publicKey).toBeDefined();
    expect(keys.encryptedPrivateKey).toBeDefined();
    expect(keys.salt).toBeDefined();
    expect(keys.publicKey.length).toBeGreaterThan(0);
    expect(keys.encryptedPrivateKey.length).toBeGreaterThan(0);
    expect(keys.salt.length).toBeGreaterThan(0);
  });

  test("decryptServiceAccountPrivateKey should round-trip", async () => {
    const token = "rsk_" + "d".repeat(64);
    const keys = await createServiceAccountKeys(token);

    const privateKey = await decryptServiceAccountPrivateKey(
      keys.encryptedPrivateKey,
      token,
      keys.salt,
    );

    expect(privateKey).toBeDefined();
    expect(privateKey.type).toBe("private");

    const pubKey = await importPublicKey(keys.publicKey);
    const testData = "round-trip-test";
    const encrypted = await encryptWithRSA(pubKey, testData);
    const decrypted = await decryptWithRSA(privateKey, encrypted);
    expect(decrypted).toBe(testData);
  });

  test("wrong token should fail to decrypt private key", async () => {
    const token = "rsk_" + "e".repeat(64);
    const keys = await createServiceAccountKeys(token);

    await expect(
      decryptServiceAccountPrivateKey(keys.encryptedPrivateKey, "rsk_wrong_token", keys.salt),
    ).rejects.toThrow(CryptoError);
  });

  test("unwrapProjectKeyWithServiceToken full chain", async () => {
    const userPassword = "user-password-123";
    const userKeys = await createUserKeys(userPassword);
    const { projectKey, encryptedProjectKey: ownerEncProjectKey } = await createProjectKey(
      userKeys.publicKey,
    );

    const token = "rsk_" + "f".repeat(64);
    const saKeys = await createServiceAccountKeys(token);

    const saPublicKey = await importPublicKey(saKeys.publicKey);
    const saEncProjectKey = await wrapAESKeyWithRSA(projectKey, saPublicKey);

    const unwrappedKey = await unwrapProjectKeyWithServiceToken(
      saEncProjectKey,
      saKeys.encryptedPrivateKey,
      token,
      saKeys.salt,
    );

    const secretValue = "super-secret-value";
    const encrypted = await encryptSecret(projectKey, secretValue);
    const decrypted = await decryptSecret(unwrappedKey, encrypted);
    expect(decrypted).toBe(secretValue);
  });
});
