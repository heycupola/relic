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
    collections::HashMap, ffi::CStr, os::raw::c_char, process::Command, sync::atomic::AtomicU32,
};
use zeroize::Zeroizing;

/// Holds the PID of the currently running child process. Read by the
/// signal handler to forward SIGTERM/SIGINT. Zero means no child is active.
static CHILD_PID: AtomicU32 = AtomicU32::new(0);

/// Forwards the received signal (SIGTERM/SIGINT) to the spawned child process,
/// ensuring it gets a chance to shut down gracefully instead of becoming orphaned.
/// Only calls async-signal-safe functions (`AtomicU32::load` + `libc::kill`).
#[cfg(unix)]
unsafe extern "C" fn forward_signal(sig: libc::c_int) {
    let pid = CHILD_PID.load(std::sync::atomic::Ordering::SeqCst);
    if pid != 0 {
        libc::kill(pid as libc::pid_t, sig);
    }
}

/// Prevents core dumps from being generated on process crash (Unix only).
///
/// Sets both the soft and hard `RLIMIT_CORE` limits to zero, ensuring that
/// no crash dump file is written to disk — which could otherwise expose
/// in-memory secrets. The child process inherits this limit, so it is
/// also prevented from dumping core. Best-effort: failures are silently
/// ignored since this is a defense-in-depth measure.
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

    // Parse command
    let command: Vec<String> = parse_json_ptr(command_json, "command")?;

    if command.is_empty() {
        return Err("command array is empty".into());
    }

    let raw_secrets: HashMap<String, String> = if secrets_json.is_null() {
        HashMap::new()
    } else {
        parse_json_ptr(secrets_json, "secrets")?
    };

    let secrets: HashMap<String, Zeroizing<String>> = raw_secrets
        .into_iter()
        .map(|(k, v)| (k, Zeroizing::new(v)))
        .collect();

    // Build command
    let program = &command[0];
    let args = &command[1..];

    let mut cmd = Command::new(program);
    cmd.args(args);

    // Inject secrets as environment variables
    for (key, value) in &secrets {
        cmd.env(key, value.as_str());
    }

    // Register signal forwarding so SIGTERM/SIGINT reach the child
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGTERM, forward_signal as libc::sighandler_t);
        libc::signal(libc::SIGINT, forward_signal as libc::sighandler_t);
    }

    // Spawn child process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to execute '{}': {}", program, e))?;

    // Store PID so the signal handler can forward signals to the child
    CHILD_PID.store(child.id(), std::sync::atomic::Ordering::SeqCst);

    // Wait for child to exit
    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for '{}': {}", program, e))?;

    // Clear PID — child has exited, no more forwarding needed
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
