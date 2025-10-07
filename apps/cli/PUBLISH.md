# Publishing to npm

This guide explains how the automatic npm publishing works.

## Setup (One-time)

### 1. Update package.json

Replace these placeholders in `package.json`:
- `@YOUR_NPM_USERNAME/relic-cli` → Your actual npm username (e.g., `@icanvardar/relic-cli`)
- `YOUR_USERNAME` → Your GitHub username
- `YOUR_NAME` → Your name

### 2. Create npm Access Token

1. Go to https://www.npmjs.com
2. Login → Click your profile → **Access Tokens**
3. Click **Generate New Token** → **Classic Token**
4. Select **Automation** (for CI/CD)
5. Copy the token (starts with `npm_...`)

### 3. Add Token to GitHub Secrets

1. Go to your GitHub repo: `https://github.com/YOUR_USERNAME/relic`
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

### 4. Remove `private: true`

The workflow automatically removes `"private": true` before publishing, but you can also remove it manually from `package.json` if you want to publish immediately.

## How It Works

### Automatic Publishing

```
1. Update version in package.json
   (e.g., 0.1.0 → 0.1.1)
   ↓
2. Commit and push to main
   git add package.json
   git commit -m "chore: bump version to 0.1.1"
   git push origin main
   ↓
3. GitHub Actions detects version change
   ↓
4. Builds for all platforms:
   - macOS arm64
   - macOS x64
   - Linux x64
   - Windows x64
   ↓
5. Collects all prebuilt binaries
   ↓
6. Publishes to npm automatically
   ↓
7. Creates GitHub Release with binaries
   ↓
8. ✅ Done! Package is live on npm
```

### Manual Version Bump

```bash
# From apps/cli directory
cd apps/cli

# Bump version (choose one)
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.0 → 0.2.0
npm version major  # 0.1.0 → 1.0.0

# Push changes
git push origin main
```

## What Gets Published

The npm package includes:
- ✅ All prebuilt Rust binaries (darwin-arm64, darwin-x64, linux-x64, win32-x64)
- ✅ TypeScript source code
- ✅ Rust source code (fallback for unsupported platforms)
- ✅ install.js (selects correct prebuilt binary)

Users don't need Rust installed - they get prebuilt binaries!

## Troubleshooting

### "Version unchanged" - Not publishing

Make sure you actually changed the version number in `package.json`.

### "npm ERR! 403 Forbidden"

Check that:
1. NPM_TOKEN is set correctly in GitHub Secrets
2. Your npm username in package.json is correct
3. The token has "Automation" permissions

### Build fails on one platform

Check the Actions tab for logs. Each platform builds independently, so you can see which one failed.

## Next Steps

After first publish:
- Install it: `npm install @your-username/relic-cli`
- Test the postinstall script works
- Verify the correct binary is loaded

## Future Additions

This workflow can be extended to:
- Homebrew formula updates
- GitHub Releases with standalone binaries
- Docker image publishing
- Cargo crates.io publishing
