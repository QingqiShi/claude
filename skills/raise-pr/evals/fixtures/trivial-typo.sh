#!/usr/bin/env bash
# Fixture: trivial-typo
# Creates a repo on main with a single-character typo fix in an error message.
# Tests that the skill produces a short summary (trivial carve-out) and omits the Notes section.
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

# Initial commit with typo in error message
cat > README.md <<'EOF'
# Connection Manager
Handles database connections.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "connection-manager",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'"
  }
}
PKGJSON
mkdir -p src
cat > src/connection.js <<'CONNJS'
class ConnectionManager {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = await createPool(this.config);
    } catch (err) {
      throw new Error(`Failed to establish databse conncetion: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = { ConnectionManager };
CONNJS
git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Fix the typo: "databse conncetion" → "database connection" ---
cat > src/connection.js <<'CONNJS'
class ConnectionManager {
  constructor(config) {
    this.config = config;
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = await createPool(this.config);
    } catch (err) {
      throw new Error(`Failed to establish database connection: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = { ConnectionManager };
CONNJS

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
