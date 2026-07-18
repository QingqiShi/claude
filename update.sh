#!/usr/bin/env bash
#
# update.sh — refresh all third-party plugins & skills to their latest versions.
#
# Run semi-regularly (see README.md for scheduling). Because the third-party
# skills are gitignored, updating them produces NO git changes — it just
# refreshes what's on this machine. Plugins update in place too.
#
#   ./update.sh
#
# Writes a timestamp + summary to .last-skill-update so staleness is visible.
set -euo pipefail

CLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="$CLAUDE_DIR/settings.json"
STAMP="$CLAUDE_DIR/.last-skill-update"

SKILLS_CLI_INSTALLED=(vercel-cli)      # skills managed by `npx skills`
PLAYWRIGHT_CLI_PKG="@playwright/cli@latest"

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# 1. Plugin marketplaces + plugins ------------------------------------------
log "Updating plugin marketplaces…"
claude plugin marketplace update || warn "  (marketplace update failed)"

log "Updating enabled plugins…"
jq -r '.enabledPlugins // {} | to_entries[] | select(.value==true) | .key' "$SETTINGS" \
| while read -r plugin; do
    [ -z "$plugin" ] && continue
    log "  plugin update $plugin"
    claude plugin update "$plugin" --scope user || warn "  (update failed: $plugin)"
  done

# 2. `skills`-CLI skills -----------------------------------------------------
log "Updating skills-CLI skills…"
npx --yes skills update --global --yes || warn "  (skills update failed)"

# 3. playwright-cli (bump the npm pkg, then regenerate the skill tree) -------
log "Updating $PLAYWRIGHT_CLI_PKG and regenerating skills/playwright-cli/…"
npm install -g "$PLAYWRIGHT_CLI_PKG"
playwright-cli install --skills || warn "  (playwright-cli install --skills failed)"

# 4. Record the run ----------------------------------------------------------
pw_ver="$(npm ls -g @playwright/cli 2>/dev/null | grep -o '@playwright/cli@[0-9.]*' | head -1 || true)"
printf 'last-update: %s\nplaywright: %s\nskills-cli: %s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${pw_ver:-unknown}" "${SKILLS_CLI_INSTALLED[*]}" > "$STAMP"

log "Done. Restart Claude Code to load updated plugins. Stamp: $STAMP"
