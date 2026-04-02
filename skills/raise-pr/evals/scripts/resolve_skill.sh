#!/usr/bin/env bash
# resolve_skill.sh — Replaces !`...` dynamic commands in SKILL.md with real output.
#
# Usage: resolve_skill.sh <repo_dir> [skill_md_path]
#
# Reads SKILL.md (or custom path), finds all !`...` patterns, executes each
# command inside <repo_dir>, and outputs the resolved markdown to stdout.
# Handles both full-line (!`cmd`) and inline (text !`cmd` text) patterns.

set -euo pipefail

REPO_DIR="$1"
SKILL_MD="${2:-$(cd "$(dirname "$0")/../.." && pwd)/SKILL.md}"

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Error: repo dir '$REPO_DIR' does not exist" >&2
  exit 1
fi

if [[ ! -f "$SKILL_MD" ]]; then
  echo "Error: SKILL.md not found at '$SKILL_MD'" >&2
  exit 1
fi

# Use Python for reliable regex replacement of !`...` patterns
python3 - "$REPO_DIR" "$SKILL_MD" <<'PYEOF'
import os, re, subprocess, sys

repo_dir = sys.argv[1]
skill_md = sys.argv[2]

with open(skill_md, 'r') as f:
    content = f.read()

skill_dir = os.path.dirname(os.path.abspath(skill_md))
env = {**os.environ, 'SKILL_DIR': skill_dir}

def run_cmd(match):
    cmd = match.group(1)
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, cwd=repo_dir, env=env
        )
        output = (result.stdout + result.stderr).rstrip('\n')
        return output
    except Exception as e:
        return f'[error: {e}]'

# Replace all !`...` patterns with command output
# \x60 is the backtick character
resolved = re.sub(r'!\x60([^\x60]+)\x60', run_cmd, content)
print(resolved, end='')
PYEOF
