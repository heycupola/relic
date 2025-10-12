use argon2::{
    Algorithm, Argon2, ParamsBuilder, PasswordHasher, Version,
    password_hash::{SaltString, rand_core::OsRng as Argon2Rng},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    ChaCha20Poly1305,
    aead::{Aead, KeyInit, OsRng as ChaChaRng},
};
use rsa::rand_core::RngCore;
use zeroize::Zeroize;

const ARGON2_MEMORY_COST: u32 = 65536; // NOTE: 64 * 1024KiB = 64MiB
const ARGON2_TIME_COST: u32 = 3; // NOTE: equivalent to around 600k PBKDF2 iterations
const ARGON2_PARALLELISM: u32 = 4;
const KEY_LENGTH: usize = 32; // NOTE: 32 bytes = 256 bits
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
/// // Store `encrypted` in Convex database
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

#[cfg(test)]
mod tests {
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
}
