# Changelog

## 0.1.0

- Status bar environment picker backed by `relic projects --json`.
- **Relic: Run with Secrets**, a `relic` task type, and `package.json` scripts as tasks.
- **Relic Shell** terminal profile with a fallback for CLIs without `relic shell`.
- Debug Node.js, Bun, and Python with secrets via `"relic": true` or **Relic: Debug Current File with Secrets**.
- Missing-secret diagnostics for JavaScript, TypeScript, and Python, using names from `relic secrets --json`.
- Setup guidance when the CLI is missing, outdated, or logged out.
