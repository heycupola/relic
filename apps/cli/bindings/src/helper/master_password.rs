use anyhow::{Context, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::helper::master_password;

const SERVICE_NAME: &str = "com.relic.cli";
const MASTER_PASSWORD_KEY: &str = "master_password";

/// Store the master password in the OS keychain
///
/// # Platform-specific storage:
/// - macOS: Keychain
/// - Windows: Windows Credential Manager
/// - Linux: keyutils (in-memory, session-scoped)
///
/// # Security:
/// - Encrypted by OS
/// - Protected by system authentication
/// - Only accessible by the current user
pub fn store_master_password(password: &str) -> Result<()> {
    let entry =
        Entry::new(SERVICE_NAME, MASTER_PASSWORD_KEY).context("Failed to create keyring entry")?;

    entry
        .set_password(password)
        .context("Failed to store master password in OS keychain")?;

    tracing::info!("Master password stored securely in OS keychain");

    Ok(())
}

/// Retrieve the master password from the OS keychain
///
/// # Returns:
/// - `Ok(Some(String))` if password exists
/// - `Ok(None)` if password not found
/// - `Err(_)` if keychain access fails
pub fn get_master_password() -> Result<Option<String>> {
    let entry =
        Entry::new(SERVICE_NAME, MASTER_PASSWORD_KEY).context("Failed to create keyring entry")?;

    match entry.get_password() {
        Ok(password) => {
            tracing::debug!("Master password retrieved from OS keychain");
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => {
            tracing::debug!("No master password found in OS keychain");
            Ok(None)
        }
        Err(e) => {
            tracing::error!("Failed to retrieve master password: {}", e);
            Err(anyhow::anyhow!(
                "Failed to retrieve master password from OS keychain: {}",
                e
            ))
        }
    }
}

/// Delete the master password from the OS keychain
///
/// # Use cases:
/// - User wants to reset their master password
/// - User is logging out/uninstalling
pub fn delete_master_password() -> Result<()> {
    let entry =
        Entry::new(SERVICE_NAME, MASTER_PASSWORD_KEY).context("Failed to create keyring entry")?;

    match entry.delete_credential() {
        Ok(_) => {
            tracing::info!("Master password deleted from OS keychain");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            tracing::debug!("No master password to delete");
            Ok(())
        }
        Err(e) => {
            tracing::error!("Failed to delete master password: {}", e);
            Err(anyhow::anyhow!(
                "Failed to delete master password from OS keychain: {}",
                e
            ))
        }
    }
}

/// Generate a random master password
///
/// Format: `word1-word2-word3-word4` (easy to read and type if needed)
pub fn generate_random_master_password() -> String {
    format!(
        "{:08x}-{:08x}-{:08x}-{:08x}",
        rand::random::<u32>(),
        rand::random::<u32>(),
        rand::random::<u32>(),
        rand::random::<u32>()
    )
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MPGuard {
    pub is_set: bool,
    pub interval: u64,
    pub last_checked: u64,
}

impl MPGuard {
    pub fn new() -> Result<Self> {
        Ok(Self {
            is_set: false,
            interval: 5, // secs
            last_checked: 0,
        })
    }

    pub fn is_available(&mut self) -> Result<bool> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .context("Unable to get epoch time")?
            .as_secs();

        if now - self.last_checked > self.interval {
            self.last_checked = now;

            match master_password::get_master_password() {
                Ok(Some(_)) => {
                    self.is_set = true;
                    return Ok(true);
                }
                Ok(None) => {
                    self.is_set = false;
                    return Ok(false);
                }
                Err(e) => {
                    tracing::error!("Failed to check master password: {}", e);
                }
            }

            return Ok(false);
        }

        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SERVICE: &str = "com.relic.cli.test";

    fn get_test_entry() -> Entry {
        Entry::new(TEST_SERVICE, "test_password").unwrap()
    }

    fn cleanup_test() {
        if let Ok(entry) = Entry::new(TEST_SERVICE, "test_password") {
            entry.delete_credential().ok();
        }
    }

    #[test]
    fn test_store_and_retrieve_master_password() {
        cleanup_test();

        let test_password = "test-password-123";
        let entry = get_test_entry();

        entry.set_password(test_password).unwrap();

        let retrieved = entry.get_password().unwrap();
        assert_eq!(retrieved, test_password);

        cleanup_test();
    }

    #[test]
    fn test_delete_master_password() {
        cleanup_test();

        let entry = get_test_entry();

        entry.set_password("test-password").unwrap();

        entry.delete_credential().unwrap();

        match entry.get_password() {
            Err(keyring::Error::NoEntry) => {}
            _ => panic!("Password should have been deleted"),
        }

        cleanup_test();
    }

    #[test]
    fn test_get_nonexistent_password() {
        cleanup_test();

        let entry = get_test_entry();

        match entry.get_password() {
            Err(keyring::Error::NoEntry) => {}
            _ => panic!("Should return NoEntry error"),
        }
    }

    #[test]
    fn test_generate_random_master_password() {
        let password1 = generate_random_master_password();
        let password2 = generate_random_master_password();

        // Passwords should be different
        assert_ne!(password1, password2);

        // Check format (8-8-8-8 hex characters with dashes)
        assert_eq!(password1.len(), 35); // 8+1+8+1+8+1+8 = 35
        assert_eq!(password1.matches('-').count(), 3);
    }
}
