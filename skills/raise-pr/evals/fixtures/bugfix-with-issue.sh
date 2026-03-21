#!/usr/bin/env bash
# Fixture: bugfix-with-issue
# Creates a repo on main with a bug fix (missing null check).
# Tests that the skill includes "Closes #<N>" when the prompt references a GitHub issue.
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

# Initial commit with buggy code
cat > README.md <<'EOF'
# User Service
Manages user profiles and settings.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "user-service",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'"
  }
}
PKGJSON
mkdir -p src
cat > src/user.js <<'USERJS'
function getUserDisplayName(user) {
  return user.profile.displayName;
}

function formatUserEmail(user) {
  return user.email.toLowerCase().trim();
}

module.exports = { getUserDisplayName, formatUserEmail };
USERJS
git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Apply bug fix: add null checks ---
cat > src/user.js <<'USERJS'
function getUserDisplayName(user) {
  if (!user || !user.profile) {
    return 'Unknown User';
  }
  return user.profile.displayName;
}

function formatUserEmail(user) {
  if (!user || !user.email) {
    return '';
  }
  return user.email.toLowerCase().trim();
}

module.exports = { getUserDisplayName, formatUserEmail };
USERJS

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
