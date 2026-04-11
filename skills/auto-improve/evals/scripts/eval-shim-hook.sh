#!/usr/bin/env bash
# eval-shim-hook.sh — PreToolUse hook for auto-improve eval runs.
#
# Reads the JSON tool-call payload from stdin. For Bash tool calls that would
# otherwise hit real GitHub or a real remote (gh pr create/edit/list/view,
# gh label create/delete/edit, git push/pull/fetch), rewrites the command to
# prepend `export PATH=<shim>:$PATH` so that the real gh-shim.sh and
# git-shim.sh binaries are invoked first. Other tool calls and other Bash
# commands pass through unchanged.
#
# Both mutating (pr create/edit) and reading (pr list/view) commands are
# intercepted — reading real GitHub state would bleed the host repo's PR
# history into eval runs and contaminate the Planner's dedupe skip list.
#
# Context (shim directory path) is read from .claude/eval-context.json in the
# worktree root — writing env vars from tmux to sub-agents is unreliable, so we
# use a sidecar file instead.
#
# Hooks are the reliable interception layer: they run in the main claude
# process and see every tool call from every agent depth, unlike PATH shims
# which get bypassed by sub-agent shell snapshots.

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Not a Bash call → allow unchanged
if [[ "$TOOL" != "Bash" ]]; then
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Locate the eval context. Look in the current worktree's .claude dir.
# CWD of the hook is the project root (where .claude/settings.json lives).
CTX=".claude/eval-context.json"
if [[ ! -f "$CTX" ]]; then
  # Not an eval run (no sidecar) → allow unchanged
  exit 0
fi

SHIM_DIR=$(jq -r '.shim_dir // ""' "$CTX")
OUTPUT_DIR=$(jq -r '.output_dir // ""' "$CTX")
PR_STATE=$(jq -r '.pr_state // ""' "$CTX")
REAL_GIT=$(jq -r '.real_git // ""' "$CTX")

if [[ -z "$SHIM_DIR" || ! -d "$SHIM_DIR" ]]; then
  # Sidecar exists but is malformed → allow unchanged, log for debugging
  echo "eval-shim-hook: shim_dir missing or invalid in $CTX" >&2
  exit 0
fi

# Match any command that reaches real GitHub or a real remote — both mutations
# and reads. Using a word-boundary-ish regex that tolerates leading whitespace,
# shell operators, and command-chaining.
SENTINEL='(^|[[:space:]]|[;&|(])'
PATTERN="${SENTINEL}(gh[[:space:]]+(pr[[:space:]]+(create|edit|list|view|checkout|close|comment|merge)|label[[:space:]]+(create|delete|edit))|git[[:space:]]+(push|pull|fetch))"

if [[ "$CMD" =~ $PATTERN ]]; then
  # Prepend PATH + env vars the shims read. Single-quote values so shell
  # metacharacters in paths don't get reinterpreted. The ` && ` chains into
  # whatever the original command was.
  PREFIX="export PATH='$SHIM_DIR':\"\$PATH\""
  PREFIX+=" GH_SHIM_CAPTURE_DIR='$OUTPUT_DIR'"
  PREFIX+=" GH_SHIM_PR_STATE='$PR_STATE'"
  PREFIX+=" REAL_GIT='$REAL_GIT'"
  REWRITTEN="$PREFIX && $CMD"
  jq -nc --arg cmd "$REWRITTEN" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "allow",
      "updatedInput": {"command": $cmd}
    }
  }'
  exit 0
fi

# No match → allow unchanged
exit 0
