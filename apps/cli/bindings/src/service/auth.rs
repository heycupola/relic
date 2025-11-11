use crate::{
    helper::{
        device_cache,
        function::{self, FunctionArg, FunctionError, deserialize_number_from_float},
        session::{self, Session},
    },
    util::app_config::AppConfig,
};
use anyhow::{Context, Result};
use convex::ConvexClient;
use owo_colors::OwoColorize;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceAuthError {
    AuthorizationPending,
    AccessDenied,
    ExpiredToken,
    InvalidGrant,
}

impl DeviceAuthError {
    pub fn from_anyhow_error(err: &anyhow::Error) -> Option<Self> {
        if let Some(func_err) = err.downcast_ref::<FunctionError>() {
            let check_str = if func_err.code != "SERVER_ERROR" {
                &func_err.code
            } else {
                &func_err.message
            };

            if check_str.contains("authorization_pending") {
                return Some(Self::AuthorizationPending);
            } else if check_str.contains("access_denied") {
                return Some(Self::AccessDenied);
            } else if check_str.contains("expired_token") {
                return Some(Self::ExpiredToken);
            } else if check_str.contains("invalid_grant") {
                return Some(Self::InvalidGrant);
            }
        }
        None
    }
}

#[derive(Debug, Deserialize)]
pub enum DeviceCodeStatus {
    Pending,
    Approved,
    Denied,
}

impl From<DeviceCodeStatus> for String {
    fn from(val: DeviceCodeStatus) -> Self {
        match val {
            DeviceCodeStatus::Pending => "pending".to_string(),
            DeviceCodeStatus::Approved => "approved".to_string(),
            DeviceCodeStatus::Denied => "denied".to_string(),
        }
    }
}

#[derive(Serialize)]
pub struct RequestDeviceCodeArg {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<Vec<String>>,
}

impl FunctionArg for RequestDeviceCodeArg {}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RequestDeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    #[serde(deserialize_with = "deserialize_number_from_float")]
    pub expires_in: u64,
    #[serde(deserialize_with = "deserialize_number_from_float")]
    pub interval: u64,
}

#[derive(Serialize)]
pub struct PollDeviceTokenArg {
    pub device_code: String,
}

impl FunctionArg for PollDeviceTokenArg {}

#[derive(Debug, Serialize, Deserialize)]
pub struct PollDeviceTokenResponse {
    pub session_token: String,
    pub token_type: String,
    #[serde(deserialize_with = "deserialize_number_from_float")]
    pub expires_in: u64,
}

pub async fn request_device_code(
    client: &mut ConvexClient,
    arg: RequestDeviceCodeArg,
) -> Result<RequestDeviceCodeResponse> {
    function::mutation(client, "deviceAuth:requestDeviceCode", arg)
        .await
        .context("Failed to request device code")
}

pub async fn poll_device_code(
    client: &mut ConvexClient,
    arg: PollDeviceTokenArg,
) -> Result<PollDeviceTokenResponse> {
    function::mutation(client, "deviceAuth:pollDeviceToken", arg)
        .await
        .context("Failed to poll device token")
}

pub async fn login(app_config: &mut AppConfig) -> Result<Session> {
    if let Ok(Some(session)) = session::load_session() {
        if !session.is_expired() {
            anyhow::bail!("Already logged in. Use 'logout' first.");
        }

        session::delete_session()?;
    }

    let device_response = if let Ok(Some(cached)) = device_cache::load_device_code() {
        println!("\n{} {}", "→".cyan(), "Using cached device code".dimmed());
        println!("\n{} {}", "→".cyan(), "Please visit:".bold());
        println!("  {}", cached.verification_uri_complete.bright_blue());
        println!("\n{} {}", "→".cyan(), "Verify code:".bold());
        println!("  {}", cached.user_code.bright_yellow().bold());
        println!("\n{}", "⏳ Waiting for approval...".dimmed());

        RequestDeviceCodeResponse {
            device_code: cached.device_code,
            user_code: cached.user_code,
            verification_uri: cached.verification_uri,
            verification_uri_complete: cached.verification_uri_complete,
            expires_in: cached.expires_at.saturating_sub(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
            interval: cached.interval,
        }
    } else {
        let response = request_device_code(
            &mut app_config.convex_client,
            RequestDeviceCodeArg {
                client_id: app_config.client_id.clone(),
                scope: None,
            },
        )
        .await
        .context("Failed to initiate device authentication flow")?;

        let expires_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + response.expires_in;

        let cache = device_cache::DeviceCodeCache::new(
            response.device_code.clone(),
            response.user_code.clone(),
            response.verification_uri.clone(),
            response.verification_uri_complete.clone(),
            expires_at,
            response.interval,
        );

        if let Err(e) = device_cache::save_device_code(cache) {
            eprintln!(
                "{} {}",
                "⚠".yellow(),
                format!("Warning: Failed to cache device code: {}", e).dimmed()
            );
        }

        println!("\n{} {}", "→".cyan(), "Please visit:".bold());
        println!("  {}", response.verification_uri_complete.bright_blue());
        println!("\n{} {}", "→".cyan(), "Verify code:".bold());
        println!("  {}", response.user_code.bright_yellow().bold());
        println!("\n{}", "⏳ Waiting for approval...".dimmed());

        response
    };

    let interval = std::time::Duration::from_secs(device_response.interval);
    let expires_at =
        std::time::SystemTime::now() + std::time::Duration::from_secs(device_response.expires_in);

    loop {
        if std::time::SystemTime::now() > expires_at {
            anyhow::bail!("Device code expired - please request a new code");
        }

        tokio::time::sleep(interval).await;

        match poll_device_code(
            &mut app_config.convex_client,
            PollDeviceTokenArg {
                device_code: device_response.device_code.clone(),
            },
        )
        .await
        {
            Ok(token_response) => {
                let expires_at_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs()
                    + token_response.expires_in;

                let session = Session::new(
                    token_response.session_token,
                    token_response.token_type,
                    expires_at_timestamp,
                );

                session::save_session(session).context("Failed to save session")?;

                device_cache::delete_device_code().ok();

                println!(
                    "{} {}",
                    "✓".green().bold(),
                    "Authentication successful!".bold()
                );
                println!("{}", "Session saved and ready to use.".dimmed());

                return session::load_session()
                    .context("Failed to load session after save")?
                    .ok_or_else(|| anyhow::anyhow!("Session should exist after save"));
            }
            Err(e) => match DeviceAuthError::from_anyhow_error(&e) {
                Some(DeviceAuthError::AuthorizationPending) => continue,
                Some(DeviceAuthError::AccessDenied) => {
                    device_cache::delete_device_code().ok();
                    anyhow::bail!("User denied access");
                }
                Some(DeviceAuthError::ExpiredToken) => {
                    device_cache::delete_device_code().ok();
                    anyhow::bail!("Device code expired");
                }
                Some(DeviceAuthError::InvalidGrant) => {
                    device_cache::delete_device_code().ok();
                    anyhow::bail!("Invalid device code");
                }
                None => {
                    return Err(e).context("Failed to poll for device token");
                }
            },
        }
    }
}

pub fn logout() -> Result<()> {
    session::delete_session()?;

    println!(
        "{} {}",
        "✓".green().bold(),
        "Successfully logged out".bold()
    );
    println!("{}", "Session cleared.".dimmed());

    Ok(())
}

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use crate::helper::function::mock;

    use super::*;

    #[tokio::test]
    #[serial]
    async fn test_request_device_code_mock() -> Result<()> {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "TEST_DEVICE_CODE".to_string(),
                user_code: "ABCD-1234".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=ABCD-1234"
                    .to_string(),
                expires_in: 600,
                interval: 5,
            },
        );

        let mut app_config = AppConfig::new().await?;

        let result: RequestDeviceCodeResponse = request_device_code(
            &mut app_config.convex_client,
            RequestDeviceCodeArg {
                client_id: app_config.client_id,
                scope: None,
            },
        )
        .await?;

        assert_eq!(result.device_code, "TEST_DEVICE_CODE");
        assert_eq!(result.user_code, "ABCD-1234");
        assert_eq!(result.expires_in, 600);
        assert_eq!(result.interval, 5);

        Ok(())
    }

    #[tokio::test]
    #[serial]
    async fn test_poll_device_code_success() -> Result<()> {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            PollDeviceTokenResponse {
                session_token: "test_session_token_123".to_string(),
                token_type: "Bearer".to_string(),
                expires_in: 3600,
            },
        );

        let mut app_config = AppConfig::new().await?;
        let result = poll_device_code(
            &mut app_config.convex_client,
            PollDeviceTokenArg {
                device_code: "TEST_DEVICE".to_string(),
            },
        )
        .await?;

        assert_eq!(result.session_token, "test_session_token_123");
        assert_eq!(result.token_type, "Bearer");
        assert_eq!(result.expires_in, 3600);

        Ok(())
    }

    #[tokio::test]
    #[serial]
    async fn test_poll_device_code_authorization_pending() -> Result<()> {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "message": "authorization_pending"
            }),
        );

        let mut app_config = AppConfig::new().await.unwrap();
        let result = poll_device_code(
            &mut app_config.convex_client,
            PollDeviceTokenArg {
                device_code: "TEST_DEVICE".to_string(),
            },
        )
        .await;

        assert!(result.is_err());

        Ok(())
    }

    #[tokio::test]
    #[serial]
    async fn test_login_success_after_pending() -> Result<()> {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "LOGIN_TEST_DEVICE".to_string(),
                user_code: "LOGIN-1234".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=ABCD-1234"
                    .to_string(),
                expires_in: 10,
                interval: 1,
            },
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "message": "authorization_pending"
            }),
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "message": "authorization_pending"
            }),
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            PollDeviceTokenResponse {
                session_token: "final_session_token".to_string(),
                token_type: "Bearer".to_string(),
                expires_in: 3600,
            },
        );

        let mut app_config = AppConfig::new().await?;
        let result = login(&mut app_config).await?;

        assert_eq!(result.session_token(), "final_session_token");
        assert_eq!(result.token_type(), "Bearer");
        assert!(!result.is_expired());

        Ok(())
    }

    #[tokio::test]
    #[serial]
    async fn test_login_user_denies_access() {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "DENY_DEVICE".to_string(),
                user_code: "DENY-5678".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=DENY-5678"
                    .to_string(),
                expires_in: 10,
                interval: 1,
            },
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "message": "authorization_pending"
            }),
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "code": "access_denied",
                "message": "User denied access"
            }),
        );

        let mut app_config = AppConfig::new().await.unwrap();
        let result = login(&mut app_config).await;

        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("User denied access")
        );
    }

    #[tokio::test]
    #[serial]
    async fn test_login_expired_token() {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "EXPIRED_DEVICE".to_string(),
                user_code: "EXPR-9999".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=EXPR-9999"
                    .to_string(),
                expires_in: 10,
                interval: 1,
            },
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "message": "authorization_pending"
            }),
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "code": "expired_token",
                "message": "Token has expired"
            }),
        );

        let mut app_config = AppConfig::new().await.unwrap();
        let result = login(&mut app_config).await;

        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Device code expired")
        );
    }

    #[tokio::test]
    #[serial]
    async fn test_login_invalid_grant() {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "INVALID_DEVICE".to_string(),
                user_code: "INVL-0000".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=INVL-0000"
                    .to_string(),
                expires_in: 10,
                interval: 1,
            },
        );

        mock::mock_mutation(
            "deviceAuth:pollDeviceToken",
            serde_json::json!({
                "__mock_error__": true,
                "code": "invalid_grant",
                "message": "Invalid device code"
            }),
        );

        let mut app_config = AppConfig::new().await.unwrap();
        let result = login(&mut app_config).await;

        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Invalid device code")
        );
    }

    #[tokio::test]
    #[serial]
    async fn test_login_timeout() {
        mock::reset();

        mock::mock_mutation(
            "deviceAuth:requestDeviceCode",
            RequestDeviceCodeResponse {
                device_code: "TIMEOUT_DEVICE".to_string(),
                user_code: "TIME-OUT1".to_string(),
                verification_uri: "https://test.com/auth/device".to_string(),
                verification_uri_complete: "https://test.com/auth/device?code=TIME-OUT1"
                    .to_string(),
                expires_in: 2,
                interval: 1,
            },
        );

        for _ in 0..5 {
            mock::mock_mutation(
                "deviceAuth:pollDeviceToken",
                serde_json::json!({
                    "__mock_error__": true,
                    "message": "authorization_pending"
                }),
            );
        }

        let mut app_config = AppConfig::new().await.unwrap();
        let result = login(&mut app_config).await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("Device code expired")
                || err_msg.contains("please request a new code")
        );
    }

    #[tokio::test]
    #[serial]
    async fn test_device_auth_error_matching() {
        let pending_err = FunctionError {
            code: "SERVER_ERROR".to_string(),
            message: "authorization_pending".to_string(),
            severity: crate::helper::function::ErrorSeverity::Low,
        };
        let anyhow_err: anyhow::Error = pending_err.into();
        assert_eq!(
            DeviceAuthError::from_anyhow_error(&anyhow_err),
            Some(DeviceAuthError::AuthorizationPending)
        );

        let denied_err = FunctionError {
            code: "access_denied".to_string(),
            message: "User denied".to_string(),
            severity: crate::helper::function::ErrorSeverity::Medium,
        };
        let anyhow_err: anyhow::Error = denied_err.into();
        assert_eq!(
            DeviceAuthError::from_anyhow_error(&anyhow_err),
            Some(DeviceAuthError::AccessDenied)
        );
    }

    #[test]
    fn test_device_code_status_conversion() {
        assert_eq!(String::from(DeviceCodeStatus::Pending), "pending");
        assert_eq!(String::from(DeviceCodeStatus::Approved), "approved");
        assert_eq!(String::from(DeviceCodeStatus::Denied), "denied");
    }
}
