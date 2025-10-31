use std::{ffi::CStr, os::raw::c_char};

pub mod util {
    pub mod app_config;
    pub mod crypto;
}

pub mod service {
    pub mod auth;
}

pub mod helper {
    pub mod function;
    pub mod session;
}

pub mod cli {
    pub mod app;
}

pub mod tui {
    pub mod app;
}

#[unsafe(no_mangle)]
pub extern "C" fn run_relic(args_json: *const c_char) {
    let args: Vec<String> = if args_json.is_null() {
        vec![]
    } else {
        unsafe {
            let json_str = CStr::from_ptr(args_json).to_string_lossy();
            serde_json::from_str(&json_str).unwrap_or_default()
        }
    };

    if args.is_empty() {
        tui::app::start_tui();
    } else {
        cli::app::run_cli_from_args(args);
    }
}
