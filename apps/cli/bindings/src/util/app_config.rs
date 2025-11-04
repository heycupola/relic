use anyhow::{Context, Result};
use std::process::Command;

use convex::ConvexClient;

use crate::telemetry::core::SentryReporter;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NAME: &str = env!("CARGO_PKG_NAME");
pub const AUTHORS: &str = env!("CARGO_PKG_AUTHORS");
pub const DESCRIPTION: &str = env!("CARGO_PKG_DESCRIPTION");

pub struct AppConfig {
    pub client_id: String,
    pub convex_client: ConvexClient,
    pub convex_deployment_url: String,
    pub version: String,
    pub name: String,
    pub authors: String,
    pub description: String,
    pub git_hash: String,
    pub sentry_proxy_endpoint: String,
    pub sentry_reporter: SentryReporter,
}

impl std::fmt::Debug for AppConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppConfig")
            .field("client_id", &self.client_id)
            .field("convex_client", &"<ConvexClient>")
            .field("convex_deployment_url", &self.convex_deployment_url)
            .field("version", &self.version)
            .field("name", &self.name)
            .field("authors", &self.authors)
            .field("description", &self.description)
            .field("git_hash", &self.git_hash)
            .field("sentry_proxy_endpoint", &self.sentry_proxy_endpoint)
            .field("sentry_reporter", &"<SentryReporter>")
            .finish()
    }
}

impl AppConfig {
    pub async fn new() -> Result<Self> {
        #[cfg(debug_assertions)]
        {
            let env_path = format!("{}/.env", env!("CARGO_MANIFEST_DIR"));
            dotenvy::from_filename(&env_path).ok();
        }

        #[cfg(test)]
        {
            let env_path = format!("{}/.env.test", env!("CARGO_MANIFEST_DIR"));
            dotenvy::from_filename(env_path).ok();
        }

        let convex_deployment_url =
            std::env::var("CONVEX_URL").unwrap_or_else(|_| "http://127.0.0.1:3210".to_string());

        let convex_client = ConvexClient::new(&convex_deployment_url)
            .await
            .context("Failed to create Convex client")?;

        let git_hash = Self::retrieve_git_hash();

        let sentry_proxy_endpoint = std::env::var("SENTRY_PROXY_ENDPOINT")
            .unwrap_or_else(|_| "https://telemetry.relic.so".to_string());

        let sentry_reporter = SentryReporter::new(sentry_proxy_endpoint.clone());

        Ok(Self {
            client_id: std::env::var("CLIENT_ID").unwrap_or_else(|_| "relic-tui".to_string()),
            convex_client,
            convex_deployment_url,
            version: VERSION.to_string(),
            name: NAME.to_string(),
            authors: AUTHORS.to_string(),
            description: DESCRIPTION.to_string(),
            git_hash,
            sentry_proxy_endpoint,
            sentry_reporter,
        })
    }

    fn retrieve_git_hash() -> String {
        let output = Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .output();

        match output {
            Ok(output) if output.status.success() => String::from_utf8(output.stdout)
                .unwrap_or_else(|_| "unknown".to_string())
                .trim()
                .to_string(),
            _ => "unknown".to_string(),
        }
    }
}
