# @repo/crypto

Cryptographic utilities package for Relic. Provides secure encryption, key management, and password derivation functions.

## Features

- RSA-OAEP for asymmetric encryption (key wrapping)
- AES-GCM for symmetric encryption
- Argon2id for password-based key derivation
- SHA-256 for hashing
- Web Crypto API based implementation

## Usage

```typescript
import { createUserKeys, encryptWithAES, decryptWithAES } from "@repo/crypto";
```
