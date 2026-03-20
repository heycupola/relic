# Contributing to relic

Thanks for your interest in contributing to relic.

## Before you start

- Read the `LICENSE` and `CODE_OF_CONDUCT.md`.
- Open an issue before starting larger changes so implementation direction can be aligned early.
- Keep pull requests focused. Small, reviewable changes are much easier to merge than broad refactors.

## Repository structure

This is a Bun + Turborepo monorepo:

```
apps/
  cli/          CLI application (Go-based)
  web/          Website, dashboard, blog, changelog (Next.js + OpenNext)
  docs/         Documentation (Mintlify)

packages/
  backend/      Convex backend (database, mutations, queries)
  tui/          Terminal UI application (Go-based)
  crypto/       Encryption primitives (AES-256-GCM, Argon2id)
  auth/         Authentication utilities
  runner/       Secret injection / process runner
  ui/           Shared React component library
  logger/       Logging utilities
  typescript-config/  Shared TS configs
```

## Local setup

1. Install [Bun](https://bun.sh) (see `.packageManager` in `package.json` for the expected version).
2. Install dependencies from the repository root:

```sh
bun install
```

3. Start all workspaces in development:

```sh
bun dev
```

To work on a specific app or package, run commands from its directory:

```sh
cd apps/web && bun dev
```

## Common commands

Run these from the repository root:

```sh
bun lint          # Lint all packages
bun check-types   # Type-check all packages
bun test          # Run all tests
bun format        # Format all packages
```

## Content workflow

Blog posts live in `apps/web/content/blog` and changelog entries in `apps/web/content/changelog`.

GitHub Releases can be synced into changelog MDX with:

```sh
cd apps/web
bun run sync:changelog
```

Set `GITHUB_TOKEN` before running the sync script if the repository is private.

## Pull request expectations

- Explain the user-facing or developer-facing impact clearly.
- Include screenshots or recordings for visual changes.
- Add or update tests when behavior changes.
- Update docs or metadata when product behavior changes publicly.
- Avoid unrelated cleanup in the same pull request.

## Code style

- Follow the existing project structure and naming conventions.
- Prefer clear, explicit code over clever abstractions.
- Keep product-facing language consistent with the website and docs.
- Do not commit secrets, credentials, or environment-specific configuration.

## Reporting security issues

Do not open public issues for security vulnerabilities. Email `can@relic.so` directly.
