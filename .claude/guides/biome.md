# Biome & Husky Guide

Biome replaces ESLint/Prettier for fast linting and formatting.

## Commands
- `bun run lint`: Lint all packages (check rules).
- `bun run format`: Format all files (fix style).
- `bun run check-types`: TypeScript type checking.
- `bun run build`: Build the monorepo.

## Git Hooks
- **Husky**: Runs `lint-staged` on pre-commit.
- **Lint-staged**: Automatically runs `biome check --write` on changed files.

## Standards
- **Indent**: 2 spaces.
- **Line width**: 100.
- **Strict Lint**: Unused variables are errors.
- **No Emojis**: Never use emojis in code or commit messages.

## Configuration
- `biome.json`: Root configuration.
- `.husky/`: Git hook scripts.
