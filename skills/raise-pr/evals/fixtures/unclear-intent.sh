#!/usr/bin/env bash
# Fixture: unclear-intent
# Creates a repo on main with mechanical file restructuring (moves and renames).
# The "what" is obvious but the "why" is not — should trigger intent-unclear termination.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVAL_TMPDIR="${EVAL_TMPDIR:-/tmp}"
WORKDIR="$(mktemp -d "$EVAL_TMPDIR/eval-raise-pr-XXXX")"

# --- Create bare remote ---
git init --bare "$WORKDIR/remote.git" >/dev/null 2>&1

# --- Create working repo ---
git init "$WORKDIR/repo" >/dev/null 2>&1
cd "$WORKDIR/repo"
git remote add origin "$WORKDIR/remote.git"

# Initial commit with flat file structure
cat > README.md <<'EOF'
# Analytics Service
Processes and reports analytics data.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "analytics-service",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'"
  }
}
PKGJSON
mkdir -p src
cat > src/tracker.js <<'TRACKERJS'
function trackEvent(name, props) {
  console.log('Event:', name, props);
}

function trackPageView(url) {
  console.log('PageView:', url);
}

module.exports = { trackEvent, trackPageView };
TRACKERJS

cat > src/reporter.js <<'REPORTERJS'
function generateReport(events) {
  return events.map(e => `${e.name}: ${e.count}`).join('\n');
}

function exportCSV(events) {
  const header = 'name,count';
  const rows = events.map(e => `${e.name},${e.count}`);
  return [header, ...rows].join('\n');
}

module.exports = { generateReport, exportCSV };
REPORTERJS

cat > src/config.js <<'CONFIGJS'
const DEFAULTS = {
  batchSize: 100,
  flushInterval: 5000,
  endpoint: '/api/analytics',
};

module.exports = { DEFAULTS };
CONFIGJS

git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Apply mechanical restructuring: move files into subdirectories ---
mkdir -p src/tracking src/reporting src/shared
git mv src/tracker.js src/tracking/tracker.js
git mv src/reporter.js src/reporting/reporter.js
git mv src/config.js src/shared/config.js

# Update imports (content changes that accompany the move)
cat > src/tracking/tracker.js <<'TRACKERJS'
const { DEFAULTS } = require('../shared/config');

function trackEvent(name, props) {
  console.log('Event:', name, props);
}

function trackPageView(url) {
  console.log('PageView:', url);
}

module.exports = { trackEvent, trackPageView };
TRACKERJS

cat > src/reporting/reporter.js <<'REPORTERJS'
const { DEFAULTS } = require('../shared/config');

function generateReport(events) {
  return events.map(e => `${e.name}: ${e.count}`).join('\n');
}

function exportCSV(events) {
  const header = 'name,count';
  const rows = events.map(e => `${e.name},${e.count}`);
  return [header, ...rows].join('\n');
}

module.exports = { generateReport, exportCSV };
REPORTERJS

# Reset staging so changes appear as unstaged (skill will stage them)
git reset HEAD -- . >/dev/null 2>&1

# --- Set up gh shim ---
mkdir -p "$WORKDIR/bin"
cp "$SCRIPT_DIR/gh-shim.sh" "$WORKDIR/bin/gh"
chmod +x "$WORKDIR/bin/gh"
export GH_SHIM_CAPTURE_DIR="$WORKDIR"

# --- Output setup info ---
echo "EVAL_REPO=$WORKDIR/repo"
echo "EVAL_WORKDIR=$WORKDIR"
echo "PATH_PREFIX=$WORKDIR/bin"
echo "GH_SHIM_CAPTURE_DIR=$WORKDIR"
