use std::path::PathBuf;

use anyhow::Result;
use directories::ProjectDirs;
use tracing_error::ErrorLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, Layer};

use super::core::SentryReporter;
use super::sentry_layer::SentryLayer;

const LOG_FILE: &str = "relic.log";

fn project_directory() -> Option<ProjectDirs> {
    ProjectDirs::from("com", "cupola", "relic")
}

pub fn get_data_dir() -> PathBuf {
    std::env::var("RELIC_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            project_directory()
                .map(|p| p.data_local_dir().to_path_buf())
                .unwrap_or_else(|| PathBuf::from(".").join(".data"))
        })
}

pub fn initialize_logging(sentry_reporter: Option<SentryReporter>) -> Result<()> {
    let directory = get_data_dir();
    std::fs::create_dir_all(&directory)?;

    let log_path = directory.join(LOG_FILE);
    let log_file = std::fs::File::create(log_path)?;

    let env_filter = tracing_subscriber::filter::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::filter::EnvFilter::new("info"));

    let file_layer = tracing_subscriber::fmt::layer()
        .with_file(true)
        .with_line_number(true)
        .with_writer(log_file)
        .with_target(false)
        .with_ansi(false)
        .with_filter(env_filter);

    // Sentry layer only in release builds
    #[cfg(not(debug_assertions))]
    let sentry_layer = sentry_reporter.map(|r| SentryLayer::new(r, "relic-cli"));

    #[cfg(debug_assertions)]
    let sentry_layer: Option<SentryLayer> = {
        let _ = sentry_reporter;
        None
    };

    tracing_subscriber::registry()
        .with(file_layer)
        .with(ErrorLayer::default())
        .with(sentry_layer)
        .init();

    Ok(())
}
