# Relic CLI

Zero-knowledge secret management for your projects.

## Installation

```bash
bun install
```

## Usage

```bash
# Authenticate
relic login
relic logout
relic whoami

# Projects
relic projects
relic init

# Run with secrets
relic run -e production -- npm run deploy
relic run -e staging -f database -- ./migrate.sh

# Filter by scope (client includes shared, server includes shared)
relic run -e production -s client -- npm run build    # Client + shared secrets
relic run -e production -s server -- npm start        # Server + shared secrets
relic run -e production -f web -s client -- npm run build  # Folder + scope filter
```

## CI/CD Usage

For CI/CD environments, use environment variables instead of interactive login:

### Environment Variables

| Variable | Description |
|----------|-------------|
| `RELIC_SESSION` | Base64-encoded session JSON |
| `RELIC_PASSWORD` | Master password for decryption |

### Getting Your Session

```bash
# Login locally first
relic login

# Export session as base64
cat ~/.config/relic/session.json | base64
```

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Deploy with secrets
        env:
          RELIC_SESSION: ${{ secrets.RELIC_SESSION }}
          RELIC_PASSWORD: ${{ secrets.RELIC_PASSWORD }}
        run: bunx relic run -e production -- npm run deploy
```

### GitLab CI

```yaml
deploy:
  stage: deploy
  script:
    - bunx relic run -e production -- npm run deploy
  variables:
    RELIC_SESSION: $RELIC_SESSION
    RELIC_PASSWORD: $RELIC_PASSWORD
```

### CircleCI

```yaml
version: 2.1

jobs:
  deploy:
    docker:
      - image: oven/bun:latest
    steps:
      - checkout
      - run:
          name: Deploy with secrets
          command: bunx relic run -e production -- npm run deploy
          environment:
            RELIC_SESSION: ${RELIC_SESSION}
            RELIC_PASSWORD: ${RELIC_PASSWORD}
```

## Development

```bash
bun run index.ts
```
