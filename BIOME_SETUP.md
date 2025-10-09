# Biome & Husky Setup Complete ✅

This document describes the Biome and Husky setup that has been configured for the Relic monorepo.

## What's Been Set Up

### 1. **Biome** (ESLint & Prettier Replacement)
Biome is now configured as the linter and formatter for all packages in the monorepo.

#### Configuration
- **Location**: `biome.json` at the root
- **Features**:
  - Fast linting and formatting
  - Automatic import organization
  - Comprehensive error detection
  - CSS files ignored (for Tailwind v4 compatibility)
  - Generated files (`_generated`) ignored
  - Bun global configured for CLI apps

#### Package Updates
All packages have been updated to use Biome:
- `apps/web` - Next.js app
- `apps/docs` - Documentation site
- `apps/cli` - CLI application
- `packages/ui` - UI component library
- `packages/backend` - Convex backend

The old `packages/eslint-config` package has been removed entirely.

### 2. **Husky** (Git Hooks)
Husky is configured to run pre-commit hooks automatically.

#### Pre-commit Hook
- **Location**: `.husky/pre-commit`
- **Action**: Runs `lint-staged` on staged files
- **What it does**:
  - Automatically lints and formats staged files before commit
  - Prevents commits with linting errors
  - Keeps code quality consistent

#### Lint-staged Configuration
- **Location**: `package.json` under `"lint-staged"`
- **Files**: `*.{js,jsx,ts,tsx,json}`
- **Command**: `biome check --write --no-errors-on-unmatched`

### 3. **GitHub Actions CI**
A CI workflow has been created to ensure code quality on every push and PR.

#### Workflow File
- **Location**: `.github/workflows/ci.yml`
- **Triggers**: Push and PR to `main` and `develop` branches

#### Jobs
1. **lint-and-typecheck**
   - Runs Biome lint
   - Runs Biome format check
   - Runs TypeScript type checking

2. **build**
   - Builds all packages
   - Depends on lint-and-typecheck passing

### 4. **Turborepo Integration**
All tasks are integrated with Turborepo for optimal caching and parallelization.

#### Updated `turbo.json`
- Added `format` task
- All tasks properly configured with dependencies

## Usage

### Local Development

```bash
# Lint all packages
bun run lint

# Format all packages
bun run format

# Type check all packages
bun run check-types

# Build all packages
bun run build

# Run all checks
bun run lint && bun run format && bun run check-types
```

### Pre-commit Hook
The pre-commit hook runs automatically when you commit:

```bash
git add .
git commit -m "feat: add new feature"
# ✅ Husky runs lint-staged automatically
```

### Bypassing Hooks (Not Recommended)
If you absolutely need to bypass the pre-commit hook:

```bash
git commit -m "WIP" --no-verify
```

## Biome Configuration Highlights

### Linting Rules
- All recommended rules enabled
- Unused variables: **error**
- Explicit `any`: **warn**
- Non-null assertions: **warn** (style preference)
- Node.js import protocol: suggested (e.g., `node:fs` instead of `fs`)

### Formatting
- **Indent**: 2 spaces
- **Line width**: 100 characters
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Trailing commas**: All
- **JSX quotes**: Double

### Files Ignored
- `node_modules`
- `dist`, `.next`, `build`
- `.turbo`
- `rust/target`, `rust/prebuilt`
- `_generated` (Convex generated files)
- `**/*.css` (linting disabled, formatting still works)

## CI/CD

The GitHub Actions workflow will:
1. ✅ Lint your code
2. ✅ Check formatting
3. ✅ Type check with TypeScript
4. ✅ Build all packages

If any step fails, the workflow will fail and prevent merging (if configured as required).

## Migration Notes

### Removed
- ❌ ESLint dependencies
- ❌ `packages/eslint-config` package
- ❌ All `eslint.config.*` files
- ❌ Prettier

### Added
- ✅ `@biomejs/biome` (in catalog)
- ✅ `husky`
- ✅ `lint-staged`
- ✅ `.husky/pre-commit` hook
- ✅ `.github/workflows/ci.yml`
- ✅ `biome.json` configuration

## Troubleshooting

### "Cannot find module" errors
Make sure you've run `bun install` after the migration.

### Pre-commit hook not running
1. Make sure Husky is initialized: `bunx husky install`
2. Check that `.husky/pre-commit` exists and is executable
3. The `prepare` script should run automatically on `bun install`

### Biome errors in generated files
Generated files should already be ignored via the `!**/_generated` pattern in `biome.json`.

### CSS linting errors
CSS files have linting disabled due to Tailwind v4 custom at-rules. Formatting still works.

## Additional Resources

- [Biome Documentation](https://biomejs.dev/)
- [Husky Documentation](https://typicode.github.io/husky/)
- [Turborepo Documentation](https://turbo.build/repo/docs)

---

**Setup completed**: October 9, 2025
**Biome version**: 2.2.5
**Husky version**: 9.1.7
