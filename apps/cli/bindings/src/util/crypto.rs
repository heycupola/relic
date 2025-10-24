use argon2::{
    password_hash::{rand_core::OsRng as Argon2Rng, SaltString},
    Algorithm, Argon2, ParamsBuilder, PasswordHasher, Version,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng as ChaChaRng},
    ChaCha20Poly1305,
};
use rsa::{
    pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey, LineEnding},
    rand_core::RngCore,
    Oaep, RsaPrivateKey, RsaPublicKey,
};
use sha2::Sha256;

#[cfg(not(test))]
const ARGON2_MEMORY_COST: u32 = 65536; // NOTE: 64 * 1024KiB = 64MiB
#[cfg(not(test))]
const ARGON2_TIME_COST: u32 = 3; // NOTE: equivalent to around 600k PBKDF2 iterations
#[cfg(not(test))]
const ARGON2_PARALLELISM: u32 = 4;
#[cfg(not(test))]
const RSA_KEY_SIZE: usize = 4096;

#[cfg(test)]
const ARGON2_MEMORY_COST: u32 = 8192;
#[cfg(test)]
const ARGON2_TIME_COST: u32 = 1;
#[cfg(test)]
const ARGON2_PARALLELISM: u32 = 1;
#[cfg(test)]
const RSA_KEY_SIZE: usize = 2048;

const KEY_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 12;

pub fn generate_salt() -> String {
    let salt = SaltString::generate(&mut Argon2Rng);

    BASE64.encode(salt.as_str().as_bytes())
}

pub fn derive_key(password: &str, salt_base64: &str) -> Result<Vec<u8>, String> {
    let salt_bytes = BASE64
        .decode(salt_base64)
        .map_err(|e| format!("Failed to decode salt: {}", e))?;

    let salt_str =
        std::str::from_utf8(&salt_bytes).map_err(|e| format!("Invalid salt format: {}", e))?;

    let salt = SaltString::from_b64(salt_str).map_err(|e| format!("Invalid salt format: {}", e))?;

    let params = ParamsBuilder::new()
        .m_cost(ARGON2_MEMORY_COST)
        .t_cost(ARGON2_TIME_COST)
        .p_cost(ARGON2_PARALLELISM)
        .output_len(KEY_LENGTH)
        .build()
        .map_err(|e| format!("Failed to build Argon2 params: {}", e))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let password_bytes = password.as_bytes();
    let hash = argon2
        .hash_password(password_bytes, &salt)
        .map_err(|e| format!("Key derivation failed: {}", e))?;

    let key_bytes = hash
        .hash
        .ok_or_else(|| "No has produced".to_string())?
        .as_bytes()
        .to_vec();

    Ok(key_bytes)
}

// =============================================================================
// SYMMETRIC ENCRYPTION
// =============================================================================

/// Encrypt plaintext using ChaCha20-Poly1305
///
/// # What it does:
/// - Takes plaintext string + 32-byte key
/// - Generates random 96-bit nonce (IV)
/// - Encrypts with ChaCha20-Poly1305 (AEAD cipher)
/// - Returns base64-encoded string: "nonce:ciphertext"
///
/// # Security:
/// - AEAD = Authenticated Encryption with Associated Data
/// - Includes 128-bit authentication tag (prevents tampering)
/// - Each encryption uses unique random nonce
///
/// # Used for:
/// - Personal secrets (encrypted with master key)
/// - Organization secrets (encrypted with org key)
///
/// # Example:
/// ```rust
/// let master_key = derive_key("password", &salt)?;
/// let encrypted = encrypt("my-secret-api-key", &master_key)?;
/// // NOTE: Store `encrypted` in Convex database
/// ```
pub fn encrypt(plaintext: &str, key: &[u8]) -> Result<String, String> {
    if key.len() != KEY_LENGTH {
        return Err(format!(
            "Invalid key length: expected {}, got {}",
            KEY_LENGTH,
            key.len()
        ));
    }

    let key_array: [u8; 32] = key
        .try_into()
        .map_err(|_| "Invalid key format".to_string())?;

    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key_array));

    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    ChaChaRng.fill_bytes(&mut nonce_bytes);
    let nonce = chacha20poly1305::Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let result = format!(
        "{}:{}",
        BASE64.encode(&nonce_bytes),
        BASE64.encode(&ciphertext)
    );

    Ok(result)
}

/// Decrypt ciphertext using ChaCha20-Poly1305
///
/// # What it does:
/// - Takes encrypted string (format: "nonce:ciphertext")
/// - Parses nonce and ciphertext from base64
/// - Decrypts with ChaCha20-Poly1305
/// - Verifies authentication tag (prevents tampering)
/// - Returns original plaintext
///
/// # Security:
/// - Will FAIL if:
///   - Wrong key used
///   - Data was tampered with
///   - Invalid format
///
/// # Example:
/// ```rust
/// let master_key = derive_key("password", &salt)?;
/// let encrypted = "nonce_base64:ciphertext_base64";  // From database
/// let plaintext = decrypt(encrypted, &master_key)?;
/// ```
pub fn decrypt(ciphertext: &str, key: &[u8]) -> Result<String, String> {
    let parts: Vec<&str> = ciphertext.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid ciphertext format: expected 'nonce:ciphertext'".to_string());
    }

    let nonce_bytes = BASE64
        .decode(parts[0])
        .map_err(|_| "Invalid nonce encoding".to_string())?;

    let ciphertext_bytes = BASE64
        .decode(parts[1])
        .map_err(|_| "Invalid ciphertext encoding".to_string())?;

    if key.len() != KEY_LENGTH {
        return Err(format!("Invalid key length: expected {}", KEY_LENGTH));
    }
    if nonce_bytes.len() != NONCE_LENGTH {
        return Err(format!("Invalid nonce length: expected {}", NONCE_LENGTH));
    }

    let key_array: [u8; 32] = key
        .try_into()
        .map_err(|_| "Invalid key format".to_string())?;

    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key_array));

    let nonce = chacha20poly1305::Nonce::from_slice(&nonce_bytes);

    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext_bytes.as_ref())
        .map_err(|_| "Decryption failed: wrong key or tampered data".to_string())?;

    String::from_utf8(plaintext_bytes).map_err(|_| "Invalid UTF-8 in decrypted data".to_string())
}

/// Generate RSA 4096-bit keypair and encrypt private key
///
/// # What it does:
/// 1. Generates RSA-4096 keypair (public + private)
/// 2. Exports public key as PKCS#8 format
/// 3. Encrypts private key with user's master key
/// 4. Returns both as base64 strings
///
/// # Used for:
/// - User onboarding (first-time setup)
/// - Enables organization membership (key wrapping)
///
/// # Security:
/// - Private key NEVER stored in plaintext
/// - Only encrypted version goes to database
/// - User needs master password to decrypt it
///
/// # Example:
/// ```rust
/// let master_key = derive_key("user-password", &salt)?;
/// let (public_key, encrypted_private_key) = generate_keypair(&master_key)?;
///
/// // NOTE: Store in Convex userKey table:
/// // { userId, publicKey, encryptedPrivateKey, salt }
/// ```
pub fn generate_keypair(master_key: &[u8]) -> Result<(String, String), String> {
    if master_key.len() != KEY_LENGTH {
        return Err("Invalid master key length".to_string());
    }

    let mut rng = ChaChaRng;
    let private_key = RsaPrivateKey::new(&mut rng, RSA_KEY_SIZE)
        .map_err(|e| format!("Failed to generate RSA keypair: {}", e))?;

    let public_key = RsaPublicKey::from(&private_key);

    let public_key_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|e| format!("Failed to encode private key: {}", e))?;

    let public_key_base64 = BASE64.encode(public_key_pem.as_bytes());

    let private_key_pem = private_key
        .to_pkcs8_pem(LineEnding::LF)
        .map_err(|e| format!("Failed to encode private key: {}", e))?;

    let encrypted_private_key = encrypt(private_key_pem.as_str(), master_key)?;

    Ok((public_key_base64, encrypted_private_key))
}

/// Decrypt user's RSA private key
///
/// # What it does:
/// - Takes encrypted private key from database
/// - Decrypts with user's master key
/// - Returns RsaPrivateKey for further operations
///
/// # Used for:
/// - Unwrapping organization keys
/// - Accessing shared secrets
pub fn decrypt_private_key(
    encrypted_private_key: &str,
    master_key: &[u8],
) -> Result<RsaPrivateKey, String> {
    let private_key_pem = decrypt(encrypted_private_key, master_key)?;

    RsaPrivateKey::from_pkcs8_pem(&private_key_pem)
        .map_err(|e| format!("Failed to parse private key: {}", e))
}

pub fn generate_org_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_LENGTH];
    ChaChaRng.fill_bytes(&mut key);
    key
}

/// Wrap (encrypt) an organization key with a member's public RSA key
///
/// # What it does:
/// - Takes organization's symmetric key (32 bytes)
/// - Encrypts it with member's RSA public key using RSA-OAEP
/// - Returns base64-encoded wrapped key
///
/// # Used for:
/// - Adding a new member to an organization
/// - Key rotation (re-wrap for all members)
///
/// # Security:
/// - Uses RSA-OAEP with SHA-256 (industry standard)
/// - Each member gets their own wrapped copy of the org key
/// - Only they can unwrap it (with their private key)
///
/// # Example:
/// ```rust
/// // Admin creates org
/// let org_key = generate_org_key();
///
/// // Add member: wrap org key with their public key
/// let wrapped_key = wrap_org_key(&org_key, &member_public_key)?;
///
/// // Store in organizationMember table:
/// // { orgId, userId, wrappedOrgKey, role }
pub fn wrap_org_key(org_key: &[u8], public_key_base64: &str) -> Result<String, String> {
    if org_key.len() != KEY_LENGTH {
        return Err(format!(
            "Invalid org key length: expected {}, got {}",
            KEY_LENGTH,
            org_key.len()
        ));
    }

    let public_key_pem_bytes = BASE64
        .decode(public_key_base64)
        .map_err(|e| format!("Failed to decode public key: {}", e))?;

    let public_key_pem = std::str::from_utf8(&public_key_pem_bytes)
        .map_err(|e| format!("Invalid UTF-8 in public key: {}", e))?;

    let public_key = RsaPublicKey::from_public_key_pem(public_key_pem)
        .map_err(|e| format!("Failed to parse public key: {}", e))?;

    let padding = Oaep::new::<Sha256>();
    let mut rng = ChaChaRng;

    let wrapper_key = public_key
        .encrypt(&mut rng, padding, org_key)
        .map_err(|e| format!("Failed to wrap org key: {}", e))?;

    Ok(BASE64.encode(&wrapper_key))
}

/// Unwrap (decrypt) an organization key with a member's private RSA key
///
/// # What it does:
/// - Takes wrapped org key from database
/// - Decrypts with member's RSA private key using RSA-OAEP
/// - Returns the 32-byte organization key
///
/// # Used for:
/// - Member accessing organization secrets
/// - Decrypting shared secrets in org projects
///
/// # Flow:
/// 1. User logs in → derives master key from password
/// 2. Decrypt their RSA private key with master key
/// 3. Unwrap org key with private key ← THIS FUNCTION
/// 4. Decrypt org secrets with org key
///
/// # Example:
/// ```rust
/// // User logs in
/// let master_key = derive_key("user-password", &salt)?;
/// let private_key = decrypt_private_key(&encrypted_private_key, &master_key)?;
///
/// // Access org secrets
/// let wrapped_org_key = "..."; // From organizationMember table
/// let org_key = unwrap_org_key(wrapped_org_key, &private_key)?;
///
/// // Now decrypt secrets
/// let secret = decrypt(&encrypted_secret, &org_key)?;
/// ```
pub fn unwrap_org_key(
    wrapped_key_base64: &str,
    private_key: &RsaPrivateKey,
) -> Result<Vec<u8>, String> {
    let wrapped_key = BASE64
        .decode(wrapped_key_base64)
        .map_err(|e| format!("Failed to decode wrapped key: {}", e))?;

    let padding = Oaep::new::<Sha256>();

    let org_key = private_key
        .decrypt(padding, &wrapped_key)
        .map_err(|_| "Failed to unwrap org key: wrong private key or corrupted data".to_string())?;

    if org_key.len() != KEY_LENGTH {
        return Err(format!(
            "Invalid unwrapped key length: expected {}, got {}",
            KEY_LENGTH,
            org_key.len()
        ));
    }

    Ok(org_key)
}

#[cfg(test)]
mod tests {
    use rsa::traits::PublicKeyParts;

    use super::*;

    #[test]
    fn test_generate_salt() {
        let salt_1 = generate_salt();
        let salt_2 = generate_salt();

        assert_ne!(salt_1, salt_2);
        assert!(BASE64.decode(&salt_1).is_ok());
    }

    #[test]
    fn test_derive_key() {
        let password = "better-than-your-password";
        let salt = generate_salt();

        let key_1 = derive_key(password, &salt).unwrap();
        let key_2 = derive_key(password, &salt).unwrap();

        assert_eq!(key_1, key_2);
        assert_eq!(key_1.len(), KEY_LENGTH);
    }

    #[test]
    fn test_derive_key_different_password() {
        let salt = generate_salt();

        let key_1 = derive_key("this-is-weird", &salt).unwrap();
        let key_2 = derive_key("cuz-you-look-gorgeous", &salt).unwrap();

        assert_ne!(key_1, key_2);
    }

    #[test]
    fn test_derive_key_different_salts() {
        let password = "hey-its-me-again";

        let key_1 = derive_key(password, &generate_salt()).unwrap();
        let key_2 = derive_key(password, &generate_salt()).unwrap();

        assert_ne!(key_1, key_2);
    }

    #[test]
    fn test_encrypt_decrypt() {
        let salt = generate_salt();
        let key = derive_key("super-good-password", &salt).unwrap();
        let plaintext = "my-secret-api-key";

        let ciphertext = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&ciphertext, &key).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_encrypt_different_nonces() {
        let key = derive_key("i-love-fred-again-rooftop-concerts", &generate_salt()).unwrap();
        let plaintext = "this-is-a-secret";

        let encrypted_1 = encrypt(plaintext, &key).unwrap();
        let encrypted_2 = encrypt(plaintext, &key).unwrap();

        assert_ne!(encrypted_1, encrypted_2);

        assert_eq!(decrypt(&encrypted_1, &key).unwrap(), plaintext);
        assert_eq!(decrypt(&encrypted_2, &key).unwrap(), plaintext);
    }

    #[test]
    fn test_decrypt_wrong_key() {
        let key_1 = derive_key("password_1", &generate_salt()).unwrap();
        let key_2 = derive_key("password_2", &generate_salt()).unwrap();

        let ciphertext = encrypt("this-is-a-secret", &key_1).unwrap();
        let result = decrypt(&ciphertext, &key_2);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("wrong key"))
    }

    #[test]
    fn test_decrypt_tampered_data() {
        let key = derive_key("password", &generate_salt()).unwrap();
        let mut ciphertext = encrypt("secret", &key).unwrap();

        ciphertext.pop();
        ciphertext.push('X');

        let result = decrypt(&ciphertext, &key);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_key_length() {
        let short_key = vec![0u8; 16];
        let result = encrypt("encrypt-me-daddy", &short_key);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid key length"));
    }

    #[test]
    fn test_generate_keypair() {
        let salt = generate_salt();
        let master_key = derive_key("a-password", &salt).unwrap();

        let result = generate_keypair(&master_key);
        assert!(result.is_ok());

        let (public_key, encrypted_private_key) = result.unwrap();

        assert!(BASE64.decode(&public_key).is_ok());

        assert!(encrypted_private_key.contains(':'));
    }

    #[test]
    fn test_decrypt_private_key() {
        let salt = generate_salt();
        let master_key = derive_key("a-password", &salt).unwrap();

        let (_, encrypted_private_key) = generate_keypair(&master_key).unwrap();

        let result = decrypt_private_key(&encrypted_private_key, &master_key);
        assert!(result.is_ok());

        let private_key = result.unwrap();

        assert_eq!(private_key.size(), RSA_KEY_SIZE / 8); // NOTE: we divided it to get byte representation of rsa key size
    }

    #[test]
    fn test_decrypt_private_key_wrong_master_key() {
        let salt = generate_salt();
        let master_key_1 = derive_key("password-1", &salt).unwrap();
        let master_key_2 = derive_key("password-2", &generate_salt()).unwrap();

        let (_, encrypted_private_key) = generate_keypair(&master_key_1).unwrap();

        let result = decrypt_private_key(&encrypted_private_key, &master_key_2);

        assert!(result.is_err());
    }

    #[test]
    fn test_keypair_deterministic_from_master_key() {
        let salt = generate_salt();
        let master_key = derive_key("a-very-strong-password", &salt).unwrap();

        let (pub_1, priv_1) = generate_keypair(&master_key).unwrap();
        let (pub_2, priv_2) = generate_keypair(&master_key).unwrap();

        assert_ne!(pub_1, pub_2);
        assert_ne!(priv_1, priv_2);
    }

    #[test]
    fn test_generate_keypair_invalid_master_key() {
        let short_key = vec![0u8; 16];

        let result = generate_keypair(&short_key);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid master key length"));
    }

    #[test]
    fn test_generate_org_key() {
        let key_1 = generate_org_key();
        let key_2 = generate_org_key();

        assert_eq!(key_1.len(), KEY_LENGTH);
        assert_eq!(key_2.len(), KEY_LENGTH);

        assert_ne!(key_1, key_2);
    }

    #[test]
    fn test_wrap_unwrap_org_key() {
        let org_key = generate_org_key();

        let master_key = derive_key("member-password", &generate_salt()).unwrap();
        let (public_key, encrypted_private_key) = generate_keypair(&master_key).unwrap();

        let wrapped_key = wrap_org_key(&org_key, &public_key).unwrap();

        let private_key = decrypt_private_key(&encrypted_private_key, &master_key).unwrap();

        let unwrapped_key = unwrap_org_key(&wrapped_key, &private_key).unwrap();

        assert_eq!(org_key, unwrapped_key);
    }

    #[test]
    fn test_unwrap_org_key_wrong_private_key() {
        let org_key = generate_org_key();

        // member 1's keypair
        let master_key_1 = derive_key("password_1", &generate_salt()).unwrap();
        let (public_key_1, _) = generate_keypair(&master_key_1).unwrap();

        // member 2's keypair
        let master_key_2 = derive_key("password_2", &generate_salt()).unwrap();
        let (_, encrypted_private_key_2) = generate_keypair(&master_key_2).unwrap();
        let private_key_2 = decrypt_private_key(&encrypted_private_key_2, &master_key_2).unwrap();

        let wrapped_key = wrap_org_key(&org_key, &public_key_1).unwrap();

        let result = unwrap_org_key(&wrapped_key, &private_key_2);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrap_org_key_invalid_length() {
        let short_key = vec![0u8; 16];
        let master_key = derive_key("this-is-a-password", &generate_salt()).unwrap();
        let (public_key, _) = generate_keypair(&master_key).unwrap();

        let result = wrap_org_key(&short_key, &public_key);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid org key length"));
    }
}
