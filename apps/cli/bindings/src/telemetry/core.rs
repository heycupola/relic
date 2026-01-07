use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone)]
pub struct Breadcrumb {
    pub timestamp: f64,
    pub message: String,
    #[serde(rename = "type")]
    pub ty: String,
}

impl Breadcrumb {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64(),
            message: message.into(),
            ty: "default".into(),
        }
    }
}

#[derive(Serialize)]
pub struct SentryEvent {
    pub message: String,
    pub source: String,
    pub level: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub breadcrumbs: Vec<Breadcrumb>,
}

#[derive(Clone)]
pub struct SentryReporter {
    client: reqwest::Client,
    endpoint: String,
}

impl SentryReporter {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .expect("Failed to create HTTP client"),
            endpoint: endpoint.into(),
        }
    }

    pub fn send(&self, event: SentryEvent) {
        let endpoint = self.endpoint.clone();
        let client = self.client.clone();
        tokio::spawn(async move {
            let _ = client.post(&endpoint).json(&event).send().await;
        });
    }

    pub fn send_blocking(&self, event: SentryEvent) {
        if let Ok(rt) = tokio::runtime::Runtime::new() {
            let client = self.client.clone();
            let endpoint = self.endpoint.clone();
            let _ = rt.block_on(async {
                client.post(&endpoint).json(&event).send().await
            });
        }
    }
}
