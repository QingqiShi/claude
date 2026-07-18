#!/usr/bin/env bash
#
# bootstrap.sh — restore third-party plugins & skills on a new machine.
#
# This repo commits only *references* (how to reinstall), never the third-party
# code itself. Run this once after `git clone` to materialise everything.
#
#   ./bootstrap.sh
#
# Idempotent: safe to re-run. See README.md for the full model.
set -euo pipefail

CLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="$CLAUDE_DIR/settings.json"

# --- Third-party skills installed via the `skills` CLI --------------------
#   format: "<github-repo-url>|<skill-name>"   (npx skills add <url> --skill <name>)
SKILLS_CLI_PACKAGES=(
  "https://github.com/vercel/vercel|vercel-cli"
)

# --- Pinned npm-package skills (binary-generated skill trees) --------------
#   @playwright/cli regenerates skills/playwright-cli/ via `playwright-cli install --skills`
PLAYWRIGHT_CLI_PKG="@playwright/cli@latest"

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH. $2"; exit 1; }
}

require jq   "Install: brew install jq"
require node "Install Node.js (nvm recommended)."
require npm  "Comes with Node.js."
require claude "Install the Claude Code CLI first."

# 1. Plugin marketplaces (built-in 'claude-plugins-official' needs no add) ---
log "Registering plugin marketplaces from settings.json…"
jq -r '.extraKnownMarketplaces // {} | to_entries[]
        | select(.value.source.source=="github") | .value.source.repo' "$SETTINGS" \
| while read -r repo; do
    [ -z "$repo" ] && continue
    log "  marketplace add $repo"
    claude plugin marketplace add "$repo" || warn "  (already registered or failed: $repo)"
  done

# 2. Plugins (source of truth = settings.json enabledPlugins) ----------------
log "Installing enabled plugins…"
jq -r '.enabledPlugins // {} | to_entries[] | select(.value==true) | .key' "$SETTINGS" \
| while read -r plugin; do
    [ -z "$plugin" ] && continue
    log "  plugin install $plugin"
    claude plugin install "$plugin" --scope user || warn "  (already installed or failed: $plugin)"
  done

# 3. `skills`-CLI third-party skills -----------------------------------------
log "Installing skills-CLI skills…"
for entry in "${SKILLS_CLI_PACKAGES[@]}"; do
  repo="${entry%%|*}"; name="${entry##*|}"
  log "  skills add $repo --skill $name"
  npx --yes skills add "$repo" --skill "$name" --global --yes || warn "  (failed: $name)"
done

# 4. playwright-cli (binary-generated — must flow in from the install command)
log "Installing $PLAYWRIGHT_CLI_PKG and regenerating skills/playwright-cli/…"
npm install -g "$PLAYWRIGHT_CLI_PKG"
playwright-cli install --skills || warn "  (playwright-cli install --skills failed)"

log "Done. Restart Claude Code to load newly-installed plugins."
