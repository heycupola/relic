use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum SentryLevel {
    Debug,
    Info,
    Warning,
    Error,
    Fatal,
}

#[derive(Serialize, Debug, Clone)]
pub struct Breadcrumb {
    pub timestamp: f64,
    pub message: String,
    #[serde(rename = "type")]
    pub breadcrumb_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

impl Breadcrumb {
    pub fn new(message: impl Into<String>, breadcrumb_type: impl Into<String>) -> Self {
        Self {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64(),
            message: message.into(),
            breadcrumb_type: breadcrumb_type.into(),
            category: None,
        }
    }

    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }
}

#[derive(Serialize, Debug)]
pub struct SentryReport {
    pub message: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<SentryLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub breadcrumbs: Option<Vec<Breadcrumb>>,
}

impl SentryReport {
    pub fn error(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            source: source.into(),
            level: Some(SentryLevel::Error),
            context: None,
            tags: None,
            user: None,
            fingerprint: None,
            breadcrumbs: None,
        }
    }

    pub fn warning(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            source: source.into(),
            level: Some(SentryLevel::Warning),
            context: None,
            tags: None,
            user: None,
            fingerprint: None,
            breadcrumbs: None,
        }
    }

    pub fn info(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            source: source.into(),
            level: Some(SentryLevel::Info),
            context: None,
            tags: None,
            user: None,
            fingerprint: None,
            breadcrumbs: None,
        }
    }

    pub fn with_context(mut self, context: serde_json::Value) -> Self {
        self.context = Some(context);
        self
    }

    pub fn with_tags(mut self, tags: HashMap<String, String>) -> Self {
        self.tags = Some(tags);
        self
    }

    pub fn with_tag(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        let mut tags = self.tags.unwrap_or_default();
        tags.insert(key.into(), value.into());
        self.tags = Some(tags);
        self
    }

    pub fn with_fingerprint(mut self, fingerprint: Vec<String>) -> Self {
        self.fingerprint = Some(fingerprint);
        self
    }

    pub fn with_breadcrumbs(mut self, breadcrumbs: Vec<Breadcrumb>) -> Self {
        self.breadcrumbs = Some(breadcrumbs);
        self
    }

    pub fn with_user(mut self, user_id: impl Into<String>) -> Self {
        self.user = Some(serde_json::json!({
            "id": user_id.into()
        }));
        self
    }
}

#[derive(Clone)]
pub struct SentryReporter {
    client: reqwest::Client,
    endpoint: String,
    enabled: bool,
}

impl SentryReporter {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .expect("Failed to create HTTP client"),
            endpoint: endpoint.into(),
            enabled: true,
        }
    }

    pub fn disabled() -> Self {
        Self {
            client: reqwest::Client::new(),
            endpoint: String::new(),
            enabled: false,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn report(&self, report: SentryReport) {
        if !self.enabled {
            return;
        }

        let endpoint = self.endpoint.clone();
        let client = self.client.clone();

        tokio::spawn(async move {
            let _ = client.post(&endpoint).json(&report).send().await;
        });
    }

    pub async fn report_sync(&self, report: SentryReport) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }

        let response = self
            .client
            .post(&self.endpoint)
            .json(&report)
            .send()
            .await
            .context("Failed to send report to Sentry")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unable to read error response".to_string());

            anyhow::bail!("Sentry rejected event (status {}): {}", status, error_text);
        }

        Ok(())
    }
}
