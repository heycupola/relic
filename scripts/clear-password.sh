#!/bin/bash

set -e

SERVICE_NAME="com.relic.tui"
SECRETS_NAME="master-password"
PASSWORD_FILE="$HOME/.relic/password"
LEGACY_FILE="$HOME/.relic_password"

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Only macOS is supported"
  exit 1
fi

if ! command -v security &>/dev/null; then
  echo "security command not found"
  exit 1
fi

# Delete from Bun secrets (macOS Keychain)
if security find-generic-password -s "$SERVICE_NAME" -a "$SECRETS_NAME" &>/dev/null; then
  security delete-generic-password -s "$SERVICE_NAME" -a "$SECRETS_NAME" 2>/dev/null || true
fi

# Delete password file
if [ -f "$PASSWORD_FILE" ]; then
  rm -f "$PASSWORD_FILE"
fi

# Delete legacy password file
if [ -f "$LEGACY_FILE" ]; then
  rm -f "$LEGACY_FILE"
fi

echo "Password cleared"
