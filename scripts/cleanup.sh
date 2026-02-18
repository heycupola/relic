#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

KEYCHAIN_SERVICE="com.relic.tui"
KEYCHAIN_NAME="master-password"

GLOBAL_CONFIG_DIR="$HOME/.config/relic"
GLOBAL_RELIC_DIR="$HOME/.relic"

PROJECT_CONFIG="relic.toml"
PROJECT_RELIC_DIR=".relic"

found_items=()

echo ""
echo -e "${BOLD}Relic Cleanup${RESET}"
echo -e "${DIM}Scanning for relic-related files and data...${RESET}"
echo ""

if [ -d "$GLOBAL_CONFIG_DIR" ]; then
  found_items+=("$GLOBAL_CONFIG_DIR (session, password, user key cache)")
fi

if [ -d "$GLOBAL_RELIC_DIR" ]; then
  found_items+=("$GLOBAL_RELIC_DIR (logs, password)")
fi

if [ -f "$PROJECT_CONFIG" ]; then
  found_items+=("$(pwd)/$PROJECT_CONFIG (project config)")
fi

if [ -d "$PROJECT_RELIC_DIR" ]; then
  found_items+=("$(pwd)/$PROJECT_RELIC_DIR (secrets cache)")
fi

keychain_found=false
if [[ "$OSTYPE" == "darwin"* ]] && command -v security &>/dev/null; then
  if security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_NAME" &>/dev/null; then
    keychain_found=true
    found_items+=("macOS Keychain: $KEYCHAIN_SERVICE/$KEYCHAIN_NAME")
  fi
fi

if [ ${#found_items[@]} -eq 0 ]; then
  echo -e "${GREEN}Nothing to clean. No relic data found.${RESET}"
  exit 0
fi

echo -e "${YELLOW}The following will be deleted:${RESET}"
echo ""
for item in "${found_items[@]}"; do
  echo -e "  ${RED}-${RESET} $item"
done
echo ""

read -r -p "Are you sure? (y/N) " confirm
echo ""

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo -e "${DIM}Aborted.${RESET}"
  exit 0
fi

[ -d "$GLOBAL_CONFIG_DIR" ] && rm -rf "$GLOBAL_CONFIG_DIR" && echo -e "  ${GREEN}Deleted${RESET} $GLOBAL_CONFIG_DIR"
[ -d "$GLOBAL_RELIC_DIR" ] && rm -rf "$GLOBAL_RELIC_DIR" && echo -e "  ${GREEN}Deleted${RESET} $GLOBAL_RELIC_DIR"
[ -f "$PROJECT_CONFIG" ] && rm -f "$PROJECT_CONFIG" && echo -e "  ${GREEN}Deleted${RESET} $(pwd)/$PROJECT_CONFIG"
[ -d "$PROJECT_RELIC_DIR" ] && rm -rf "$PROJECT_RELIC_DIR" && echo -e "  ${GREEN}Deleted${RESET} $(pwd)/$PROJECT_RELIC_DIR"

if [ "$keychain_found" = true ]; then
  security delete-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_NAME" 2>/dev/null || true
  echo -e "  ${GREEN}Deleted${RESET} Keychain: $KEYCHAIN_SERVICE/$KEYCHAIN_NAME"
fi

echo ""
echo -e "${GREEN}All relic data cleared.${RESET}"
