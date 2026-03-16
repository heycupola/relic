const REPO = "heycupola/relic";

const INSTALL_SCRIPT = `#!/bin/sh
set -e

REPO="${REPO}"
INSTALL_DIR="\${RELIC_INSTALL_DIR:-$HOME/.relic}"
BIN_DIR="$INSTALL_DIR/bin"

main() {
  need_cmd curl
  need_cmd tar
  need_cmd uname

  local _os _arch _target _url _version _archive

  _os="$(detect_os)"
  _arch="$(detect_arch)"
  _target="\${_os}-\${_arch}"
  _version="$(get_latest_version)"

  if [ -z "$_version" ]; then
    err "could not determine latest version"
  fi

  printf "\\n  %s\\n\\n" "Installing relic $_version ($_target)"

  _archive="relic-\${_target}.tar.gz"
  _url="https://github.com/$REPO/releases/download/\${_version}/\${_archive}"

  local _tmp_dir
  _tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$_tmp_dir"' EXIT

  printf "  %s" "Downloading..."
  curl -fsSL "$_url" -o "$_tmp_dir/$_archive" || err "download failed. Check that $_target is supported at https://github.com/$REPO/releases"
  printf " done\\n"

  printf "  %s" "Extracting..."
  mkdir -p "$BIN_DIR"
  tar -xzf "$_tmp_dir/$_archive" -C "$BIN_DIR"
  chmod +x "$BIN_DIR/relic"
  printf " done\\n"

  add_to_path

  printf "\\n  %s\\n\\n" "relic $_version installed successfully!"
  printf "  %s\\n" "Run 'relic login' to get started."
  printf "\\n"
}

detect_os() {
  local _os
  _os="$(uname -s)"
  case "$_os" in
    Linux)  echo "linux" ;;
    Darwin) echo "darwin" ;;
    MINGW* | MSYS* | CYGWIN*) err "Windows is not supported by the install script. Use 'npm install -g relic' or download from https://github.com/${REPO}/releases" ;;
    *) err "unsupported operating system: $_os" ;;
  esac
}

detect_arch() {
  local _arch
  _arch="$(uname -m)"
  case "$_arch" in
    x86_64 | amd64)  echo "x64" ;;
    aarch64 | arm64)  echo "arm64" ;;
    *) err "unsupported architecture: $_arch" ;;
  esac
}

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \\
    | grep '"tag_name"' \\
    | head -1 \\
    | sed 's/.*"tag_name": *"\\(.*\\)".*/\\1/'
}

add_to_path() {
  local _profile _in_path

  _in_path=0
  case ":$PATH:" in
    *":$BIN_DIR:"*) _in_path=1 ;;
  esac

  if [ "$_in_path" -eq 1 ]; then
    return
  fi

  local _shell_name _line
  _shell_name="$(basename "$SHELL")"
  _line="export PATH=\\"$BIN_DIR:\\$PATH\\""

  case "$_shell_name" in
    zsh)  _profile="$HOME/.zshrc" ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then
        _profile="$HOME/.bash_profile"
      else
        _profile="$HOME/.bashrc"
      fi
      ;;
    fish)
      _line="fish_add_path $BIN_DIR"
      _profile="$HOME/.config/fish/config.fish"
      ;;
    *)    _profile="$HOME/.profile" ;;
  esac

  if [ -n "$_profile" ]; then
    echo "$_line" >> "$_profile"
    printf "  %s\\n" "Added $BIN_DIR to PATH in $_profile"
    printf "  %s\\n" "Restart your shell or run: source $_profile"
  fi
}

need_cmd() {
  if ! command -v "$1" > /dev/null 2>&1; then
    err "need '$1' (command not found)"
  fi
}

err() {
  printf "\\n  error: %s\\n\\n" "$1" >&2
  exit 1
}

main "$@"
`;

export async function GET() {
  return new Response(INSTALL_SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
