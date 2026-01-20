use anyhow::{Context, Result};
use std::{ffi::CStr, os::raw::c_char};

mod telemetry;

pub mod util {
    pub mod app_config;
}

pub mod service {
    pub mod auth;
}

pub mod cli {
    pub mod app;
}

use telemetry::{initialize_logging, setup_panic_handler};
use util::app_config::AppConfig;

#[unsafe(no_mangle)]
pub extern "C" fn run_app(args_json: *const c_char) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    if let Err(e) = rt.block_on(run_app_async(args_json)) {
        eprintln!("Error running CLI: {}", e);
    }
}

async fn run_app_async(args_json: *const c_char) -> Result<()> {
    // Create app config first to get the sentry reporter
    let app_config = AppConfig::new().await?;

    // Initialize logging with sentry reporter
    initialize_logging(Some(app_config.sentry_reporter.clone()))?;

    // Parse the JSON string from C (handle null pointer)
    let args: Vec<String> = if args_json.is_null() {
        vec![]
    } else {
        let c_str = unsafe {
            CStr::from_ptr(args_json)
                .to_str()
                .context("Failed to parse C string")?
        };
        serde_json::from_str(c_str).unwrap_or_default()
    };

    // Setup panic handler
    setup_panic_handler(app_config.sentry_reporter.clone());

    // Run CLI with args (empty args will show help)
    cli::app::run_cli_from_args(args, app_config).await
}
