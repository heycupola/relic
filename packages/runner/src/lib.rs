//! Relic Runner - Secret injection and process spawning
//!
//! This library provides a single FFI function that:
//! 1. Receives a command and secrets as JSON
//! 2. Injects secrets as environment variables
//! 3. Spawns the process and returns its exit code
//!
//! All network operations (auth, fetching secrets) are handled
//! by the TypeScript CLI. This runner is purely for secure
//! process spawning with env var injection.

use std::{
    collections::HashMap,
    ffi::CStr,
    os::raw::c_char,
    process::Command,
};

/// Run a command with secrets injected as environment variables.
///
/// # Arguments
/// * `command_json` - JSON array: `["program", "arg1", "arg2"]`
/// * `secrets_json` - JSON object: `{"SECRET_KEY": "secret_value"}`
///
/// # Returns
/// * Exit code of the process (0-255), or -1 on error
///
/// # Safety
/// Both pointers must be valid null-terminated C strings or null.
#[unsafe(no_mangle)]
pub extern "C" fn run_with_secrets(command_json: *const c_char, secrets_json: *const c_char) -> i32 {
    match run_with_secrets_impl(command_json, secrets_json) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("relic-runner error: {e}");
            -1
        }
    }
}

fn run_with_secrets_impl(command_json: *const c_char, secrets_json: *const c_char) -> Result<i32, String> {
    // Parse command
    let command: Vec<String> = parse_json_ptr(command_json, "command")?;
    
    if command.is_empty() {
        return Err("command array is empty".into());
    }

    // Parse secrets (empty object if null)
    let secrets: HashMap<String, String> = if secrets_json.is_null() {
        HashMap::new()
    } else {
        parse_json_ptr(secrets_json, "secrets")?
    };

    // Build command
    let program = &command[0];
    let args = &command[1..];

    let mut cmd = Command::new(program);
    cmd.args(args);

    // Inject secrets as environment variables
    for (key, value) in &secrets {
        cmd.env(key, value);
    }

    // Spawn and wait
    let status = cmd
        .status()
        .map_err(|e| format!("failed to execute '{}': {}", program, e))?;

    Ok(status.code().unwrap_or(-1))
}

fn parse_json_ptr<T: serde::de::DeserializeOwned>(ptr: *const c_char, name: &str) -> Result<T, String> {
    if ptr.is_null() {
        return Err(format!("{name} is null"));
    }

    let c_str = unsafe { CStr::from_ptr(ptr) };
    let str = c_str.to_str().map_err(|_| format!("{name} is not valid UTF-8"))?;
    
    serde_json::from_str(str).map_err(|e| format!("failed to parse {name}: {e}"))
}
