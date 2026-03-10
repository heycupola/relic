# @repo/crypto

Cryptographic primitives for Relic. Handles key generation, encryption, decryption, and password-based key derivation.

## Algorithms

| Algorithm | Usage | Parameters |
|-----------|-------|------------|
| RSA-OAEP | Asymmetric encryption, key wrapping | 2048-bit, SHA-256 |
| AES-256-GCM | Symmetric encryption | 12-byte IV prepended to ciphertext |
| Argon2id | Password-based key derivation | 64 MB memory, 3 iterations, parallelism 4, 32-byte output |
| SHA-256 | Hashing | Web Crypto API |

## Exports

### Key Generation

| Function | Description |
|----------|-------------|
| `generateRSAKeyPair()` | RSA-OAEP 2048-bit key pair |
| `generateAESKey()` | AES-256-GCM key |
| `generateSalt()` | 16-byte random salt (base64) |
| `generateIV()` | 12-byte random IV |

### Key Derivation

| Function | Description |
|----------|-------------|
| `deriveKeyFromPassword(password, salt)` | Argon2id password to AES-256 key |

### Key Import / Export

| Function | Description |
|----------|-------------|
| `exportPublicKey(key)` | CryptoKey to base64 (SPKI) |
| `exportPrivateKey(key)` | CryptoKey to base64 (PKCS8) |
| `importPublicKey(base64)` | Base64 to CryptoKey (SPKI) |
| `importPrivateKey(base64)` | Base64 to CryptoKey (PKCS8) |

### Private Key Storage

| Function | Description |
|----------|-------------|
| `encryptPrivateKeyWithPassword(privateKey, password)` | AES-GCM encrypt private key with password-derived key |
| `decryptPrivateKeyWithPassword(encrypted, password, salt)` | Decrypt and import private key |

### RSA Encryption

| Function | Description |
|----------|-------------|
| `encryptWithRSA(publicKey, data)` | Encrypt data (max 190 bytes) |
| `decryptWithRSA(privateKey, data)` | Decrypt RSA ciphertext |

### AES Encryption

| Function | Description |
|----------|-------------|
| `encryptWithAES(key, plaintext)` | AES-256-GCM encrypt, IV prepended |
| `decryptWithAES(key, ciphertext)` | AES-256-GCM decrypt |

### Key Wrapping

| Function | Description |
|----------|-------------|
| `wrapAESKeyWithRSA(aesKey, rsaPublicKey)` | Wrap AES key with RSA public key |
| `unwrapAESKeyWithRSA(wrapped, rsaPrivateKey)` | Unwrap AES key with RSA private key |
| `wrapAESKeyWithAES(innerKey, outerKey)` | Wrap AES key with another AES key |
| `unwrapAESKeyWithAES(wrapped, outerKey)` | Unwrap AES key with another AES key |

### High-Level Helpers

| Function | Description |
|----------|-------------|
| `createUserKeys(password)` | Generate RSA pair, encrypt private key, return `SerializedKeyPair` |
| `createProjectKey(userPublicKey)` | Generate AES project key, wrap with user RSA public key |
| `unwrapProjectKey(wrappedKey, password, encryptedPrivateKey, salt)` | Unwrap project key using user credentials |
| `encryptSecret(projectKey, plaintext)` | Encrypt a secret value with project AES key |
| `decryptSecret(projectKey, ciphertext)` | Decrypt a secret value with project AES key |

### Types

| Type | Description |
|------|-------------|
| `RSAKeyPair` | `{ publicKey, privateKey }` |
| `SerializedKeyPair` | `{ publicKey, encryptedPrivateKey, salt }` |
| `CryptoError` | Error class with `code`, `message`, `cause` |
| `CryptoErrorCode` | Union of error codes |

## Dependencies

- `argon2` -- Argon2id key derivation
- Web Crypto API -- RSA, AES, random bytes

## Development

```bash
bun test
```
