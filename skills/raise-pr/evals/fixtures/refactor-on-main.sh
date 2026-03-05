#!/usr/bin/env bash
# Fixture: refactor-on-main
# Creates a repo on main with multi-file refactor changes (unstaged).
# Tests that the skill classifies as "refactor" and mentions all changed files.
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

# Initial commit with existing code that uses callbacks
cat > README.md <<'EOF'
# Data Pipeline
Processes and transforms data files.
EOF
cat > package.json <<'PKGJSON'
{
  "name": "data-pipeline",
  "version": "2.0.0",
  "scripts": {
    "lint": "echo 'lint ok'",
    "build": "echo 'build ok'",
    "test": "echo 'tests ok'"
  }
}
PKGJSON
mkdir -p src
cat > src/reader.js <<'READERJS'
const fs = require('fs');

function readFile(path, callback) {
  fs.readFile(path, 'utf8', (err, data) => {
    if (err) return callback(err);
    callback(null, data);
  });
}

module.exports = { readFile };
READERJS

cat > src/transformer.js <<'TRANSJS'
function transform(data, callback) {
  try {
    const parsed = JSON.parse(data);
    const result = parsed.map(item => ({
      ...item,
      processed: true,
      timestamp: Date.now()
    }));
    callback(null, JSON.stringify(result));
  } catch (err) {
    callback(err);
  }
}

module.exports = { transform };
TRANSJS

cat > src/writer.js <<'WRITERJS'
const fs = require('fs');

function writeFile(path, data, callback) {
  fs.writeFile(path, data, 'utf8', (err) => {
    if (err) return callback(err);
    callback(null);
  });
}

module.exports = { writeFile };
WRITERJS

cat > src/pipeline.js <<'PIPEJS'
const { readFile } = require('./reader');
const { transform } = require('./transformer');
const { writeFile } = require('./writer');

function runPipeline(inputPath, outputPath, callback) {
  readFile(inputPath, (err, data) => {
    if (err) return callback(err);
    transform(data, (err, result) => {
      if (err) return callback(err);
      writeFile(outputPath, result, callback);
    });
  });
}

module.exports = { runPipeline };
PIPEJS

git add -A
git commit -m "chore: initial commit" >/dev/null 2>&1
git push -u origin main >/dev/null 2>&1

# --- Refactor: convert all files from callbacks to async/await ---
cat > src/reader.js <<'READERJS'
const fs = require('fs').promises;

async function readFile(path) {
  return fs.readFile(path, 'utf8');
}

module.exports = { readFile };
READERJS

cat > src/transformer.js <<'TRANSJS'
async function transform(data) {
  const parsed = JSON.parse(data);
  return JSON.stringify(
    parsed.map(item => ({
      ...item,
      processed: true,
      timestamp: Date.now()
    }))
  );
}

module.exports = { transform };
TRANSJS

cat > src/writer.js <<'WRITERJS'
const fs = require('fs').promises;

async function writeFile(path, data) {
  await fs.writeFile(path, data, 'utf8');
}

module.exports = { writeFile };
WRITERJS

cat > src/pipeline.js <<'PIPEJS'
const { readFile } = require('./reader');
const { transform } = require('./transformer');
const { writeFile } = require('./writer');

async function runPipeline(inputPath, outputPath) {
  const data = await readFile(inputPath);
  const result = await transform(data);
  await writeFile(outputPath, result);
}

module.exports = { runPipeline };
PIPEJS

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
