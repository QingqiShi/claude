#!/usr/bin/env bash
# Fixture: bare-directive-deletion
# Creates a repo on main with a file deletion (user said "remove X" with no reason).
# The conversation gives a directive but no motivation — should trigger intent-unclear.
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

# Initial commit with a skill/config file
cat > README.md <<'EOF'
# My Project
A web application with custom tooling.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'"
  }
}
PKGJSON
mkdir -p config
cat > config/deploy.yml <<'DEPLOYYML'
# Deployment configuration
provider: aws
region: us-east-1
instances: 2
health_check: /healthz
timeout: 30
rollback: true
DEPLOYYML

cat > config/monitoring.yml <<'MONYML'
# Monitoring configuration
alerts:
  - name: high-latency
    threshold: 500ms
    channel: "#ops"
  - name: error-rate
    threshold: 5%
    channel: "#ops"
dashboards:
  - api-latency
  - error-rates
MONYML

git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Delete the monitoring config (bare directive, no reason given) ---
rm config/monitoring.yml

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
