use argon2::{
    Algorithm, Argon2, Params, ParamsBuilder, PasswordHasher, Version,
    password_hash::{SaltString, rand_core::OsRng},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use zeroize::Zeroize;

const ARGON2_MEMORY_COST: u32 = 65536; // NOTE: 64 * 1024KiB = 64MiB
const ARGON2_TIME_COST: u32 = 3; // NOTE: equivalent to around 600k PBKDF2 iterations
const ARGON2_PARALLELISM: u32 = 4;
const KEY_LENGTH: usize = 32; // NOTE: 32 bytes = 256 bits

pub fn generate_salt() -> String {
    let salt = SaltString::generate(&mut OsRng);

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
}
