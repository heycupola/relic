use anyhow::Result;
use std::{ffi::CStr, os::raw::c_char};

use crate::{telemetry::panic::setup_panic_handler, util::app_config::AppConfig};

pub mod util {
    pub mod app_config;
    pub mod crypto;
}

pub mod service {
    pub mod auth;
}

pub mod helper {
    pub mod device_cache;
    pub mod function;
    pub mod session;
}

pub mod cli {
    pub mod app;
}

pub mod tui {
    pub mod app;
    pub(crate) mod components;
    pub(crate) mod home;
    pub(crate) mod modal;
    pub(crate) mod project_screen;
    pub(crate) mod screen;
    pub(crate) mod state;
}

pub mod telemetry {
    pub mod core;
    pub mod macros;
    pub mod panic;
}

#[unsafe(no_mangle)]
pub extern "C" fn run_app(args_json: *const c_char) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    if let Err(e) = rt.block_on(run_app_async(args_json)) {
        eprintln!("Error running CLI: {}", e);
    }
}

async fn run_app_async(args_json: *const c_char) -> Result<()> {
    let app_config = AppConfig::new().await?;

    setup_panic_handler(app_config.sentry_reporter.clone());

    let args: Vec<String> = if args_json.is_null() {
        vec![]
    } else {
        unsafe {
            let json_str = CStr::from_ptr(args_json).to_string_lossy();
            serde_json::from_str(&json_str).unwrap_or_default()
        }
    };

    if args.is_empty() {
        tui::app::start_tui(app_config);
        Ok(())
    } else {
        cli::app::run_cli_from_args(args, app_config).await
    }
}
