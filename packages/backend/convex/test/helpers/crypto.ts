// Test crypto helper utilities for zero-knowledge encryption testing
// Provides RSA-OAEP (key wrapping) and AES-GCM (data encryption) operations
// Compatible with Web Crypto API standards used in production

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
}

export async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  );
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

export async function deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
  const saltBuffer = base64ToArrayBuffer(salt);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(exported);
}

export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
  return arrayBufferToBase64(exported);
}

export async function importPublicKey(publicKeyStr: string): Promise<CryptoKey> {
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
}

export async function importPrivateKey(privateKeyStr: string): Promise<CryptoKey> {
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
}

export async function encryptPrivateKeyWithPassword(
  privateKey: CryptoKey,
  password: string,
  salt: string,
): Promise<string> {
  const derivedKey = await deriveKeyFromPassword(password, salt);
  const privateKeyData = await exportPrivateKey(privateKey);
  const iv = generateIV();

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    derivedKey,
    encoder.encode(privateKeyData),
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return arrayBufferToBase64(combined);
}

export async function decryptPrivateKeyWithPassword(
  encryptedPrivateKey: string,
  password: string,
  salt: string,
): Promise<CryptoKey> {
  const derivedKey = await deriveKeyFromPassword(password, salt);
  const combined = base64ToArrayBuffer(encryptedPrivateKey);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

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
}

export async function encryptWithRSA(publicKey: CryptoKey, data: string): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encoder.encode(data),
  );

  return arrayBufferToBase64(encrypted);
}

export async function decryptWithRSA(
  privateKey: CryptoKey,
  encryptedData: string,
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encryptedData);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    ciphertext,
  );

  return decoder.decode(decrypted);
}

export async function wrapAESKeyWithRSA(
  aesKey: CryptoKey,
  rsaPublicKey: CryptoKey,
): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", aesKey, rsaPublicKey, {
    name: "RSA-OAEP",
  });

  return arrayBufferToBase64(wrapped);
}

export async function unwrapAESKeyWithRSA(
  wrappedKey: string,
  rsaPrivateKey: CryptoKey,
): Promise<CryptoKey> {
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
}

export async function encryptWithAES(aesKey: CryptoKey, data: string): Promise<string> {
  const iv = generateIV();

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    encoder.encode(data),
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return arrayBufferToBase64(combined);
}

export async function decryptWithAES(aesKey: CryptoKey, encryptedData: string): Promise<string> {
  const combined = base64ToArrayBuffer(encryptedData);

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    ciphertext,
  );

  return decoder.decode(decrypted);
}

export async function createUserKeys(password: string): Promise<SerializedKeyPair> {
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
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
