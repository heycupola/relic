<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./apps/web/public/relic-logo-light.svg">
    <source media="(prefers-color-scheme: light)" srcset="./apps/web/public/relic-logo-dark.svg">
    <img alt="relic" src="./apps/web/public/relic-logo-dark.svg" width="48">
  </picture>
</p>

<p align="center">
  End-to-end encrypted secret layer for developers.<br>
  Secrets are encrypted on-device before reaching the server.
</p>

<p align="center">
  <a href="https://github.com/heycupola/relic/stargazers"><img src="https://img.shields.io/github/stars/heycupola/relic?style=flat" alt="GitHub Stars"></a>
  <a href="https://github.com/heycupola/relic/blob/canary/LICENSE"><img src="https://img.shields.io/github/license/heycupola/relic" alt="License"></a>
  <a href="https://docs.relic.so"><img src="https://img.shields.io/badge/docs-relic.so-blue" alt="Docs"></a>
</p>

<p align="center">
  <a href="https://relic.so"><img src="./apps/docs/assets/tui-overview.png" alt="Relic Terminal UI" width="800"></a>
</p>

---

### What is Relic?

Relic is a CLI-first secret layer built for developers and teams.

- Secrets are encrypted on the client before leaving the device. The server stores only ciphertext.
- A Rust-based runner injects secrets at runtime without writing to disk.
- Share projects with teammates. Each person's secrets are encrypted with their own keys.
- Works in CI/CD. Use API keys to pull secrets in GitHub Actions, GitLab CI, or any pipeline.

### Install

```bash
curl -fsSL https://relic.so/install | bash
brew install heycupola/tap/relic
npm install -g relic
bun add -g relic
```

Or download a prebuilt binary from the [releases page](https://github.com/heycupola/relic/releases).

### Quick Start

```bash
relic login                                    # Authenticate via browser
relic init                                     # Initialize your project
relic                                          # Open the TUI and start managing secrets
relic run -e production -- npm run deploy      # Run with secrets injected
```

### How It Works

Relic encrypts and decrypts secrets on the client using AES-256 and Argon2id. The server only stores encrypted data.

When you run `relic run`, the CLI fetches encrypted secrets, decrypts them locally, and injects them into the target process through a Rust runner that clears memory after use. No secrets are written to disk.

Learn more in the [documentation](https://docs.relic.so).

### Contributing

If you're interested in contributing to Relic, please read our [contributing guide](./CONTRIBUTING.md) before submitting a pull request.

For security issues, email [can@relic.so](mailto:can@relic.so) directly. Do not open public issues.

---

[Website](https://relic.so) | [Documentation](https://docs.relic.so) | [Changelog](https://relic.so/changelog) | [X](https://x.com/icanvardar)
