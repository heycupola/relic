# @repo/runner

Rust library for secure secret injection into child processes. Loaded via Bun FFI from the CLI. Secrets are injected as environment variables into a sandboxed child process and wiped from memory after use.

## FFI Interface

Single exported function:

```c
int32_t run_with_secrets(const char *command_json, const char *secrets_json);
```

- `command_json`: JSON array of strings (command + arguments), e.g. `["npm", "run", "deploy"]`
- `secrets_json`: JSON object of key-value pairs, e.g. `{"DATABASE_URL": "postgres://..."}`
- Returns the child process exit code (0-255), or `-1` on error

## Security

### Memory

Secret values are stored in `Zeroizing<String>` (from the `zeroize` crate). Memory is overwritten with zeroes when dropped. The TypeScript side also zeroes its buffers after the FFI call.

### Core Dumps

On Unix, `RLIMIT_CORE` is set to zero before spawning the child process. This prevents core dumps that could leak secrets to disk.

### Environment Isolation

On Unix, the child process starts with a cleared environment (`env_clear()`). Only a small allowlist of system variables is inherited:

```
PATH, HOME, USER, SHELL, TERM, LANG, LC_ALL, LC_CTYPE, TMPDIR, TZ
```

Secrets are then injected on top of this clean environment.

### Signal Forwarding

SIGTERM and SIGINT are intercepted and forwarded to the child process via a global `AtomicU32` PID, allowing the child to shut down gracefully.

### Key Validation

Secret keys are validated before injection:

- No empty keys
- No null bytes in keys
- No `=` characters in keys (prevents env injection)

## Platform Support

| Feature | Unix | Windows |
|---------|------|---------|
| Environment clearing | Yes (allowlist) | No (full inherit) |
| Core dump prevention | Yes (`RLIMIT_CORE`) | No |
| Signal forwarding | Yes (SIGTERM, SIGINT) | No |
| Secret injection | Yes | Yes |
| Zeroizing | Yes | Yes |

Prebuilt binaries are provided for: `darwin-arm64`, `darwin-x64`, `linux-x64`, `win32-x64`.

## Build

```bash
cargo build --release
```

Output:

| Platform | Library |
|----------|---------|
| macOS | `librelic_runner.dylib` |
| Linux | `librelic_runner.so` |
| Windows | `relic_runner.dll` |

## TypeScript Integration

The CLI loads the library via Bun `dlopen`:

```typescript
import { dlopen, FFIType } from "bun:ffi";

const lib = dlopen(libPath, {
  run_with_secrets: {
    args: [FFIType.cstring, FFIType.cstring],
    returns: FFIType.i32,
  },
});
```

Library search order:

1. `apps/cli/prebuilds/<platform>/` (production)
2. `packages/runner/target/release/` (development)
3. `packages/runner/target/debug/` (development fallback)

## Dependencies

- `libc` - Unix system calls (setrlimit, signal, kill)
- `serde` + `serde_json` - JSON deserialization
- `zeroize` - Secure memory wiping

## Development

```bash
cargo build          # Debug build
cargo build --release  # Release build
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```
