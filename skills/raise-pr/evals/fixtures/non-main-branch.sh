#!/usr/bin/env bash
# Fixture: non-main-branch
# Creates a repo on branch feature/existing-work with uncommitted changes.
# Tests branch safety (stop), --base-from-main, --stack-on-current, --commit-to-current.
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

# Initial commit on main
cat > README.md <<'EOF'
# My App
A web application.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'"
  }
}
PKGJSON
mkdir -p src
cat > src/app.js <<'APPJS'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello'));
module.exports = app;
APPJS
git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Create feature branch with an existing commit ---
git checkout -b feature/existing-work >/dev/null 2>&1
cat > src/utils.js <<'UTILSJS'
function formatDate(date) {
  return date.toISOString().split('T')[0];
}
module.exports = { formatDate };
UTILSJS
git add -A
git commit -m "feat: add date formatting utility" >/dev/null 2>&1
git push -u origin feature/existing-work >/dev/null 2>&1

# --- Add uncommitted changes (the "new work" to be PR'd) ---
cat > src/validators.js <<'VALJS'
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 8;
}

module.exports = { validateEmail, validatePassword };
VALJS

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
