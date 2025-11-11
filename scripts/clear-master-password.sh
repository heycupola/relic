#!/bin/bash

# Relic - Clear Master Password Script
# This script removes the master password from macOS Keychain

set -e

SERVICE_NAME="com.relic.cli"
ACCOUNT_NAME="master_password"

echo "🔐 Relic - Clear Master Password"
echo "================================"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ This script is currently only supported on macOS"
  echo "For other platforms, please manually remove the credential:"
  echo "  - Windows: Use Credential Manager"
  echo "  - Linux: The credential is session-based and will be cleared on logout"
  exit 1
fi

# Check if security command exists
if ! command -v security &>/dev/null; then
  echo "❌ 'security' command not found. Are you on macOS?"
  exit 1
fi

# Check if the password exists
echo "Checking if master password exists in Keychain..."
if security find-generic-password -s "$SERVICE_NAME" -a "$ACCOUNT_NAME" &>/dev/null; then
  echo "✅ Master password found in Keychain"
  echo ""

  # Ask for confirmation
  read -p "Are you sure you want to delete the master password? (y/N): " -n 1 -r
  echo ""

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Delete the password
    if security delete-generic-password -s "$SERVICE_NAME" -a "$ACCOUNT_NAME" 2>/dev/null; then
      echo "✅ Master password successfully deleted from Keychain!"
      echo ""
      echo "⚠️  Note: You will need to set up a new master password on next login."
    else
      echo "❌ Failed to delete master password. You may need to enter your macOS password."
      exit 1
    fi
  else
    echo "❌ Operation cancelled"
    exit 0
  fi
else
  echo "ℹ️  No master password found in Keychain"
  echo "Nothing to delete."
fi

echo ""
echo "Done! 🎉"
