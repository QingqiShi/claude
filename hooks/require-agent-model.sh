#!/usr/bin/env bash
set -euo pipefail

# A fork always runs on the parent model, so it has no model to choose.
if jq -e '.tool_input.subagent_type == "fork" or ((.tool_input.model // "") | length > 0)' >/dev/null; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "The Agent tool was called without a model parameter. Retry with model set to haiku, sonnet, opus, or fable."
  }
}'
