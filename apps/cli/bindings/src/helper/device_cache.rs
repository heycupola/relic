use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const DIR_NAME: &str = "relic";
const FILE_NAME: &str = "device_code_cache.json";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeviceCodeCache {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_at: u64,
    pub interval: u64,
}

impl DeviceCodeCache {
    pub fn new(
        device_code: String,
        user_code: String,
        verification_uri: String,
        verification_uri_complete: String,
        expires_at: u64,
        interval: u64,
    ) -> Self {
        Self {
            device_code,
            user_code,
            verification_uri,
            verification_uri_complete,
            expires_at,
            interval,
        }
    }

    pub fn is_expired(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now >= self.expires_at
    }
}

fn get_cache_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("Could not find config directory")?
        .join(DIR_NAME);

    fs::create_dir_all(&config_dir).context("Failed to create config directory")?;

    Ok(config_dir.join(FILE_NAME))
}

#[cfg(unix)]
fn set_file_permissions(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(windows)]
fn set_file_permissions(_path: &PathBuf) -> Result<()> {
    Ok(())
}

pub fn save_device_code(cache: DeviceCodeCache) -> Result<()> {
    let path = get_cache_path()?;
    let json = serde_json::to_string_pretty(&cache).context("Failed to serialize cache")?;

    fs::write(&path, json).context("Failed to write cache file")?;

    set_file_permissions(&path)?;

    Ok(())
}

pub fn load_device_code() -> Result<Option<DeviceCodeCache>> {
    let path = get_cache_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path).context("Failed to read cache file")?;

    let cache: DeviceCodeCache =
        serde_json::from_str(&contents).context("Failed to parse cache file")?;

    if cache.is_expired() {
        delete_device_code()?;
        return Ok(None);
    }

    Ok(Some(cache))
}

pub fn delete_device_code() -> Result<()> {
    let path = get_cache_path()?;

    if path.exists() {
        fs::remove_file(path).context("Failed to delete cache file")?;
    }

    Ok(())
}
