# Contributing to relic

Thanks for your interest in contributing to relic.

## Before you start

- Read the `LICENSE` and `CODE_OF_CONDUCT.md`.
- Open an issue before starting larger changes so implementation direction can be aligned early.
- Keep pull requests focused. Small, reviewable changes are much easier to merge than broad refactors.

## Local setup

1. Install the current Bun toolchain used by the repository.
2. Install dependencies from the repository root:

```sh
bun install
```

3. Start the workspace in development:

```sh
bun dev
```

## Common commands

Run these from the repository root unless a package-specific workflow is required.

```sh
bun lint
bun check-types
bun test
```

If you are changing a specific package or app, also run the most relevant package-level commands before opening a pull request.

## Content workflow

- Blog posts live in `apps/web/content/blog`.
- Changelog entries live in `apps/web/content/changelog`.
- GitHub Releases can be synced into generated changelog MDX with:

```sh
cd apps/web
bun run sync:changelog
```

If the repository is private, set `GITHUB_TOKEN` before running the changelog sync script locally.

## Pull request expectations

- Explain the user-facing or developer-facing impact clearly.
- Include screenshots or recordings for visual changes when possible.
- Add or update tests when behavior changes.
- Update docs, copy, or metadata when product behavior changes publicly.
- Avoid unrelated cleanup in the same pull request.

## Code style

- Follow the existing project structure and naming conventions.
- Prefer clear, explicit code over clever abstractions.
- Keep public-facing product language consistent with the website and docs.
- Do not commit secrets, credentials, or environment-specific configuration.

## Reporting security issues

Do not open public issues for sensitive security reports. Use the appropriate private channel with the maintainers instead.
