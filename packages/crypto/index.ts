import argon2 from "argon2";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const IV_LENGTH = 12;
// NOTE: RSA-OAEP max plaintext size for 2048-bit key
const RSA_MAX_MESSAGE_SIZE = 190;

export type CryptoErrorCode =
  | "INVALID_INPUT"
  | "INVALID_BASE64"
  | "INVALID_CIPHERTEXT"
  | "RSA_MESSAGE_TOO_LARGE"
  | "KEY_GENERATION_FAILED"
  | "KEY_DERIVATION_FAILED"
  | "KEY_EXPORT_FAILED"
  | "KEY_IMPORT_FAILED"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "KEY_WRAP_FAILED"
  | "KEY_UNWRAP_FAILED";

export class CryptoError extends Error {
  override cause?: unknown;

  constructor(
    public readonly code: CryptoErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "CryptoError";
    this.cause = cause;
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CryptoError("INVALID_INPUT", `${name} must be a non-empty string`);
  }
}

function assertValidBase64(value: string, name: string): void {
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(value)) {
    throw new CryptoError("INVALID_BASE64", `${name} contains invalid base64 characters`);
  }
}

function assertMinLength(data: ArrayBuffer | Uint8Array, minLength: number, name: string): void {
  const length = data instanceof ArrayBuffer ? data.byteLength : data.length;
  if (length < minLength) {
    throw new CryptoError(
      "INVALID_CIPHERTEXT",
      `${name} is too short: expected at least ${minLength} bytes, got ${length}`,
    );
  }
}

export interface RSAKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface SerializedKeyPair {
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
}

export async function generateRSAKeyPair(): Promise<RSAKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  } catch (error) {
    throw new CryptoError("KEY_GENERATION_FAILED", "Failed to generate RSA key pair", error);
  }
}

export async function generateAESKey(): Promise<CryptoKey> {
  try {
    return await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    throw new CryptoError("KEY_GENERATION_FAILED", "Failed to generate AES key", error);
  }
}

export function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return arrayBufferToBase64(salt);
}

export function generateIV(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

function toArrayBuffer(data: Uint8Array | Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(data.length);
  new Uint8Array(arrayBuffer).set(data);
  return arrayBuffer;
}

// NOTE: Argon2id with OWASP params (64MB, 3 iter, 4 threads)
export async function deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
  assertNonEmptyString(password, "password");
  assertNonEmptyString(salt, "salt");

  try {
    const saltBuffer = base64ToArrayBuffer(salt);

    const rawKey = await argon2.hash(password, {
      type: argon2.argon2id,
      salt: Buffer.from(saltBuffer),
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
      hashLength: 32,
      raw: true,
    });

    const keyBuffer = new Uint8Array(rawKey).buffer as ArrayBuffer;

    return await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_DERIVATION_FAILED", "Failed to derive key from password", error);
  }
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  try {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    return arrayBufferToBase64(exported);
  } catch (error) {
    throw new CryptoError("KEY_EXPORT_FAILED", "Failed to export public key", error);
  }
}

// NOTE: Use encryptPrivateKeyWithPassword for storage
export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  try {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    return arrayBufferToBase64(exported);
  } catch (error) {
    throw new CryptoError("KEY_EXPORT_FAILED", "Failed to export private key", error);
  }
}

export async function importPublicKey(publicKeyStr: string): Promise<CryptoKey> {
  assertNonEmptyString(publicKeyStr, "publicKeyStr");

  try {
    const keyBuffer = base64ToArrayBuffer(publicKeyStr);
    return await crypto.subtle.importKey(
      "spki",
      keyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["encrypt", "wrapKey"],
    );
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_IMPORT_FAILED", "Failed to import public key", error);
  }
}

export async function importPrivateKey(privateKeyStr: string): Promise<CryptoKey> {
  assertNonEmptyString(privateKeyStr, "privateKeyStr");

  try {
    const keyBuffer = base64ToArrayBuffer(privateKeyStr);
    return await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt", "unwrapKey"],
    );
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_IMPORT_FAILED", "Failed to import private key", error);
  }
}

// NOTE: IV prepended to ciphertext
export async function encryptPrivateKeyWithPassword(
  privateKey: CryptoKey,
  password: string,
  salt: string,
): Promise<string> {
  assertNonEmptyString(password, "password");
  assertNonEmptyString(salt, "salt");

  try {
    const derivedKey = await deriveKeyFromPassword(password, salt);
    const privateKeyData = await exportPrivateKey(privateKey);
    const iv = generateIV();

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
      },
      derivedKey,
      encoder.encode(privateKeyData),
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return arrayBufferToBase64(combined);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("ENCRYPTION_FAILED", "Failed to encrypt private key", error);
  }
}

export async function decryptPrivateKeyWithPassword(
  encryptedPrivateKey: string,
  password: string,
  salt: string,
): Promise<CryptoKey> {
  assertNonEmptyString(encryptedPrivateKey, "encryptedPrivateKey");
  assertNonEmptyString(password, "password");
  assertNonEmptyString(salt, "salt");

  try {
    const derivedKey = await deriveKeyFromPassword(password, salt);
    const combinedBuffer = base64ToArrayBuffer(encryptedPrivateKey);

    assertMinLength(combinedBuffer, IV_LENGTH + 1, "encrypted private key");

    const combined = new Uint8Array(combinedBuffer);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      derivedKey,
      ciphertext,
    );

    const privateKeyStr = decoder.decode(decrypted);
    return await importPrivateKey(privateKeyStr);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError(
      "DECRYPTION_FAILED",
      "Failed to decrypt private key - incorrect password or corrupted data",
      error,
    );
  }
}

// NOTE: Max 190 bytes, use encryptWithAES for larger data
export async function encryptWithRSA(publicKey: CryptoKey, data: string): Promise<string> {
  assertNonEmptyString(data, "data");

  const encoded = encoder.encode(data);
  if (encoded.length > RSA_MAX_MESSAGE_SIZE) {
    throw new CryptoError(
      "RSA_MESSAGE_TOO_LARGE",
      `Data too large for RSA encryption: ${encoded.length} bytes exceeds maximum of ${RSA_MAX_MESSAGE_SIZE} bytes`,
    );
  }

  try {
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "RSA-OAEP",
      },
      publicKey,
      encoded,
    );

    return arrayBufferToBase64(encrypted);
  } catch (error) {
    throw new CryptoError("ENCRYPTION_FAILED", "RSA encryption failed", error);
  }
}

export async function decryptWithRSA(
  privateKey: CryptoKey,
  encryptedData: string,
): Promise<string> {
  assertNonEmptyString(encryptedData, "encryptedData");

  try {
    const ciphertext = base64ToArrayBuffer(encryptedData);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      ciphertext,
    );

    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("DECRYPTION_FAILED", "RSA decryption failed", error);
  }
}

export async function wrapAESKeyWithRSA(
  aesKey: CryptoKey,
  rsaPublicKey: CryptoKey,
): Promise<string> {
  try {
    const wrapped = await crypto.subtle.wrapKey("raw", aesKey, rsaPublicKey, {
      name: "RSA-OAEP",
    });

    return arrayBufferToBase64(wrapped);
  } catch (error) {
    throw new CryptoError("KEY_WRAP_FAILED", "Failed to wrap AES key with RSA", error);
  }
}

export async function unwrapAESKeyWithRSA(
  wrappedKey: string,
  rsaPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  assertNonEmptyString(wrappedKey, "wrappedKey");

  try {
    const keyBuffer = base64ToArrayBuffer(wrappedKey);

    return await crypto.subtle.unwrapKey(
      "raw",
      keyBuffer,
      rsaPrivateKey,
      {
        name: "RSA-OAEP",
      },
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_UNWRAP_FAILED", "Failed to unwrap AES key with RSA", error);
  }
}

export async function wrapAESKeyWithAES(
  keyToWrap: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<string> {
  try {
    const iv = generateIV();
    const wrapped = await crypto.subtle.wrapKey("raw", keyToWrap, wrappingKey, {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    });

    const combined = new Uint8Array(iv.length + wrapped.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(wrapped), iv.length);

    return arrayBufferToBase64(combined);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_WRAP_FAILED", "Failed to wrap AES key with AES", error);
  }
}

export async function unwrapAESKeyWithAES(
  wrappedKey: string,
  unwrappingKey: CryptoKey,
): Promise<CryptoKey> {
  assertNonEmptyString(wrappedKey, "wrappedKey");

  try {
    const combinedBuffer = base64ToArrayBuffer(wrappedKey);
    assertMinLength(combinedBuffer, IV_LENGTH + 1, "wrapped key");

    const combined = new Uint8Array(combinedBuffer);
    const iv = combined.slice(0, IV_LENGTH);
    const wrapped = combined.slice(IV_LENGTH);

    return await crypto.subtle.unwrapKey(
      "raw",
      wrapped,
      unwrappingKey,
      {
        name: "AES-GCM",
        iv: iv,
      },
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("KEY_UNWRAP_FAILED", "Failed to unwrap AES key with AES", error);
  }
}

// NOTE: IV prepended to ciphertext
export async function encryptWithAES(aesKey: CryptoKey, data: string): Promise<string> {
  assertNonEmptyString(data, "data");

  try {
    const iv = generateIV();

    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
      },
      aesKey,
      encoder.encode(data),
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return arrayBufferToBase64(combined);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("ENCRYPTION_FAILED", "AES encryption failed", error);
  }
}

// NOTE: Expects IV prepended
export async function decryptWithAES(aesKey: CryptoKey, encryptedData: string): Promise<string> {
  assertNonEmptyString(encryptedData, "encryptedData");

  try {
    const combinedBuffer = base64ToArrayBuffer(encryptedData);

    assertMinLength(combinedBuffer, IV_LENGTH + 1, "encrypted data");

    const combined = new Uint8Array(combinedBuffer);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      ciphertext,
    );

    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError("DECRYPTION_FAILED", "AES decryption failed", error);
  }
}

export async function createUserKeys(password: string): Promise<SerializedKeyPair> {
  assertNonEmptyString(password, "password");

  const keyPair = await generateRSAKeyPair();
  const salt = generateSalt();

  const publicKey = await exportPublicKey(keyPair.publicKey);
  const encryptedPrivateKey = await encryptPrivateKeyWithPassword(
    keyPair.privateKey,
    password,
    salt,
  );

  return {
    publicKey,
    encryptedPrivateKey,
    salt,
  };
}

export async function createProjectKey(userPublicKey: string): Promise<{
  projectKey: CryptoKey;
  encryptedProjectKey: string;
}> {
  assertNonEmptyString(userPublicKey, "userPublicKey");

  const projectKey = await generateAESKey();
  const publicKey = await importPublicKey(userPublicKey);
  const encryptedProjectKey = await wrapAESKeyWithRSA(projectKey, publicKey);

  return {
    projectKey,
    encryptedProjectKey,
  };
}

export async function unwrapProjectKey(
  encryptedProjectKey: string,
  userEncryptedPrivateKey: string,
  userPassword: string,
  userSalt: string,
): Promise<CryptoKey> {
  assertNonEmptyString(encryptedProjectKey, "encryptedProjectKey");
  assertNonEmptyString(userEncryptedPrivateKey, "userEncryptedPrivateKey");
  assertNonEmptyString(userPassword, "userPassword");
  assertNonEmptyString(userSalt, "userSalt");

  const privateKey = await decryptPrivateKeyWithPassword(
    userEncryptedPrivateKey,
    userPassword,
    userSalt,
  );
  return await unwrapAESKeyWithRSA(encryptedProjectKey, privateKey);
}

export async function encryptSecret(projectKey: CryptoKey, secretValue: string): Promise<string> {
  return await encryptWithAES(projectKey, secretValue);
}

export async function decryptSecret(
  projectKey: CryptoKey,
  encryptedValue: string,
): Promise<string> {
  return await decryptWithAES(projectKey, encryptedValue);
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Buffer.from(bytes).toString("base64");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  assertValidBase64(base64, "base64 input");
  const uint8 = new Uint8Array(Buffer.from(base64, "base64"));
  return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
}
