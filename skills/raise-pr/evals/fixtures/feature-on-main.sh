#!/usr/bin/env bash
# Fixture: feature-on-main
# Creates a repo on main branch with new JWT auth files (unstaged).
# Simulates a developer who just wrote a new feature and wants to PR it.
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

# Initial commit so main exists
cat > README.md <<'EOF'
# My API
A simple REST API.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "my-api",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'lint ok'",
    "build": "echo 'build ok'"
  }
}
PKGJSON
git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Add new feature files (unstaged) ---
mkdir -p src/auth
cat > src/auth/jwt.js <<'JWTJS'
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';

function generateToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '24h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { generateToken, verifyToken };
JWTJS

cat > src/auth/middleware.js <<'MWJS'
const { verifyToken } = require('./jwt');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware };
MWJS

cat > src/auth/routes.js <<'RTJS'
const express = require('express');
const { generateToken } = require('./jwt');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Stub: accept any credentials
  const token = generateToken(username);
  res.json({ token });
});

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;
RTJS

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
