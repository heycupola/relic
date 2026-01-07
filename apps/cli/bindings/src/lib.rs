use anyhow::{Context, Result};
use std::{ffi::CStr, os::raw::c_char};

use crate::{
    telemetry::{panic::setup_panic_handler, tracing::initialize_logging},
    util::app_config::AppConfig,
};

pub mod util {
    pub mod app_config;
}

pub mod service {
    pub mod auth;
}

pub mod cli {
    pub mod app;
}

pub mod telemetry {
    pub mod core;
    pub mod macros;
    pub mod panic;
    pub mod tracing;
}

#[unsafe(no_mangle)]
pub extern "C" fn run_app(args_json: *const c_char) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    if let Err(e) = rt.block_on(run_app_async(args_json)) {
        eprintln!("Error running CLI: {}", e);
    }
}

async fn run_app_async(args_json: *const c_char) -> Result<()> {
    // Parse the JSON string from C
    let c_str = unsafe {
        CStr::from_ptr(args_json)
            .to_str()
            .context("Failed to parse C string")?
    };
    
    let args: Vec<String> = serde_json::from_str(c_str)
        .context("Failed to parse JSON args")?;
    
    // Initialize logging
    initialize_logging().map_err(|e| anyhow::anyhow!("Failed to initialize logging: {}", e))?;
    
    // Create app config
    let app_config = AppConfig::new().await?;
    
    // Setup panic handler
    setup_panic_handler(app_config.sentry_reporter.clone());
    
    // Run CLI with args
    cli::app::run_cli_from_args(args, app_config).await
}
