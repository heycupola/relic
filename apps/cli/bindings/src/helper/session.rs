use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const DIR_NAME: &str = "relic";
const FILE_NAME: &str = "session.json";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Session {
    session_token: String,
    token_type: String,
    expires_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    jwt_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    jwt_expires_at: Option<u64>,
}

impl Session {
    pub fn new(session_token: String, token_type: String, expires_at: u64) -> Self {
        Self {
            session_token,
            token_type,
            expires_at,
            jwt_token: None,
            jwt_expires_at: None,
        }
    }

    pub fn jwt_token(&self) -> Option<&str> {
        self.jwt_token.as_deref()
    }

    pub fn is_jwt_expired(&self) -> bool {
        match self.jwt_expires_at {
            None => true,
            Some(exp) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                now >= exp
            }
        }
    }

    pub fn set_jwt(&mut self, jwt_token: String, jwt_expires_at: u64) {
        self.jwt_token = Some(jwt_token);
        self.jwt_expires_at = Some(jwt_expires_at);
    }

    pub fn session_token(&self) -> &str {
        self.session_token.as_str()
    }

    pub fn token_type(&self) -> &str {
        self.token_type.as_str()
    }

    pub fn is_expired(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        now >= self.expires_at
    }
}

fn get_session_path() -> Result<PathBuf> {
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
    // TODO: implement windows-acl
    Ok(())
}

pub fn save_session(session: Session) -> Result<()> {
    let path = get_session_path()?;
    let json = serde_json::to_string_pretty(&session).context("Failed to serialize session")?;

    fs::write(&path, json).context("Failed to write session file")?;

    set_file_permissions(&path)?;

    Ok(())
}

pub fn load_session() -> Result<Option<Session>> {
    let path = get_session_path()?;

    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path).context("Failed to read session file")?;

    let session: Session =
        serde_json::from_str(&contents).context("Failed to parse session file")?;

    Ok(Some(session))
}

pub fn delete_session() -> Result<()> {
    let path = get_session_path()?;

    if path.exists() {
        fs::remove_file(path).context("Failed to delete session file")?;
    }

    Ok(())
}

pub fn get_session_token() -> Result<Option<String>> {
    Ok(load_session()?.map(|s| s.session_token))
}

pub fn update_session<F>(update_fn: F) -> Result<()>
where
    F: FnOnce(&mut Session),
{
    if let Some(mut session) = load_session()? {
        update_fn(&mut session);
        save_session(session)?;
    }
    Ok(())
}
