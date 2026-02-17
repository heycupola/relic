//! Relic Runner - Secure secret injection and process spawning.
//!
//! Provides a single FFI entry point (`run_with_secrets`) that receives a
//! command and secrets as JSON, injects them as environment variables into
//! a child process, and returns its exit code. All network operations
//! (auth, fetching secrets) are handled by the TypeScript CLI.

use std::{
    collections::HashMap, ffi::CStr, os::raw::c_char, process::Command, sync::atomic::AtomicU32,
};
use zeroize::Zeroizing;

/// PID of the active child process; read by `forward_signal` to relay signals.
static CHILD_PID: AtomicU32 = AtomicU32::new(0);

/// Relays the incoming signal to the child so it can shut down gracefully.
#[cfg(unix)]
unsafe extern "C" fn forward_signal(sig: libc::c_int) {
    let pid = CHILD_PID.load(std::sync::atomic::Ordering::SeqCst);
    if pid != 0 {
        libc::kill(pid as libc::pid_t, sig);
    }
}

/// Sets `RLIMIT_CORE` to zero to prevent core dumps that could leak secrets.
#[cfg(unix)]
fn disable_core_dumps() {
    unsafe {
        let rlim = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        libc::setrlimit(libc::RLIMIT_CORE, &rlim);
    }
}

/// Minimal set of env vars re-inherited after `env_clear()` so the child can function.
#[cfg(unix)]
const INHERITED_ENV_KEYS: &[&str] = &[
    "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ",
];

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
pub extern "C" fn run_with_secrets(
    command_json: *const c_char,
    secrets_json: *const c_char,
) -> i32 {
    match run_with_secrets_impl(command_json, secrets_json) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("relic-runner error: {e}");
            -1
        }
    }
}

fn run_with_secrets_impl(
    command_json: *const c_char,
    secrets_json: *const c_char,
) -> Result<i32, String> {
    #[cfg(unix)]
    disable_core_dumps();

    let command: Vec<String> = parse_json_ptr(command_json, "command")?;

    if command.is_empty() {
        return Err("command array is empty".into());
    }

    let raw_secrets: HashMap<String, String> = if secrets_json.is_null() {
        HashMap::new()
    } else {
        parse_json_ptr(secrets_json, "secrets")?
    };

    // Wrap values in Zeroizing so they are wiped from memory on drop
    let secrets: HashMap<String, Zeroizing<String>> = raw_secrets
        .into_iter()
        .map(|(k, v)| (k, Zeroizing::new(v)))
        .collect();

    let program = &command[0];
    let args = &command[1..];

    let mut cmd = Command::new(program);
    cmd.args(args);

    // Strip inherited env, then re-add only essential vars and secrets
    cmd.env_clear();

    #[cfg(unix)]
    for key in INHERITED_ENV_KEYS {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    for (key, value) in &secrets {
        cmd.env(key, value.as_str());
    }

    // Install signal forwarding before spawning
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGTERM, forward_signal as libc::sighandler_t);
        libc::signal(libc::SIGINT, forward_signal as libc::sighandler_t);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to execute '{}': {}", program, e))?;

    CHILD_PID.store(child.id(), std::sync::atomic::Ordering::SeqCst);

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for '{}': {}", program, e))?;

    CHILD_PID.store(0, std::sync::atomic::Ordering::SeqCst);

    Ok(status.code().unwrap_or(-1))
}

fn parse_json_ptr<T: serde::de::DeserializeOwned>(
    ptr: *const c_char,
    name: &str,
) -> Result<T, String> {
    if ptr.is_null() {
        return Err(format!("{name} is null"));
    }

    let c_str = unsafe { CStr::from_ptr(ptr) };
    let str = c_str
        .to_str()
        .map_err(|_| format!("{name} is not valid UTF-8"))?;

    serde_json::from_str(str).map_err(|e| format!("failed to parse {name}: {e}"))
}
