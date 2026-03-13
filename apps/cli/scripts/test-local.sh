#!/bin/bash
ACTION="${1:-enable}"
ALIAS_NAME="relic-dev"
ALIAS_CMD="alias $ALIAS_NAME=\"bun $(cd "$(dirname "$0")/.." && pwd)/index.ts\""
SHELL_RC="$HOME/.zshrc"
if [ "$ACTION" = "enable" ]; then
  if grep -q "$ALIAS_NAME" "$SHELL_RC" 2>/dev/null; then
    echo "$ALIAS_NAME alias already exists in $SHELL_RC"
  else
    echo "$ALIAS_CMD" >>"$SHELL_RC"
    echo "Added $ALIAS_NAME alias to $SHELL_RC"
  fi
  echo "Run: source ~/.zshrc"
  echo "Then use: $ALIAS_NAME login, $ALIAS_NAME whoami, etc."
elif [ "$ACTION" = "disable" ]; then
  sed -i '' "/$ALIAS_NAME/d" "$SHELL_RC"
  echo "Removed $ALIAS_NAME alias from $SHELL_RC"
  echo "Run: source ~/.zshrc"
else
  echo "Usage: ./test-local.sh [enable|disable]"
fi
