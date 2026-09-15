#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"

# Guard every jq read with a fallback so bad input cannot crash the hook;
# a read that fails must fail closed (deny), not exit without a decision.
read_field() {
  jq -r "$1" <<<"$payload" 2>/dev/null || true
}

subagent_type="$(read_field '.tool_input.subagent_type // empty')"
model="$(read_field '.tool_input.model // empty')"
cwd="$(read_field '.cwd // empty')"

DENY_REASON="The Agent tool was called without a model parameter. Retry with model set to haiku, sonnet, opus, or fable. An agent definition that sets model: in its frontmatter is exempt."

deny() {
  jq -n --arg reason "$DENY_REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# A fork always runs on the parent model, so it has no model to choose.
if [ "$subagent_type" = "fork" ]; then
  exit 0
fi

if [ -n "$model" ]; then
  exit 0
fi

[ -n "$subagent_type" ] || deny

# Print only the frontmatter block (the text between the first two "---"
# lines). A mention of "model" in the body must not count.
frontmatter() {
  awk 'NR==1 && $0=="---"{f=1; next} f && $0=="---"{exit} f' "$1" 2>/dev/null
}

# "inherit" tells Claude Code to run on the parent model, so it is not a
# declared model: the definition made no cost choice.
has_model_key() {
  local value
  value="$(frontmatter "$1" | grep -E '^model:' | head -1 | sed -E 's/^model:[[:space:]]*//; s/[[:space:]]+$//')"
  [ -n "$value" ] && [ "$value" != "inherit" ]
}

# Find the agent definition in a directory. Match by the frontmatter "name:"
# field. The filename stem is the fallback when a definition has no name
# field.
find_agent_file() {
  local dir="$1" name="$2" f fm_name
  [ -d "$dir" ] || return 1
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    fm_name="$(frontmatter "$f" | grep -E '^name:' | head -1 | sed -E 's/^name:[[:space:]]*//; s/[[:space:]]+$//')"
    if [ "$fm_name" = "$name" ]; then
      printf '%s\n' "$f"
      return 0
    fi
  done
  if [ -e "$dir/$name.md" ]; then
    printf '%s\n' "$dir/$name.md"
    return 0
  fi
  return 1
}

agent_file=""

case "$subagent_type" in
  *:*)
    plugin_name="${subagent_type%%:*}"
    agent_name="${subagent_type#*:}"
    agents_dir=""

    # A plugin:name type resolves against the installed plugin's agents dir.
    # The manifest records the install path, so read it instead of guessing
    # the version number.
    manifest="${HOME:-}/.claude/plugins/installed_plugins.json"
    if [ -n "${HOME:-}" ] && [ -f "$manifest" ]; then
      install_path="$(jq -r --arg name "$plugin_name" '
        .plugins // {}
        | to_entries[]
        | select(.key | startswith($name + "@"))
        | .value[0].installPath? // empty
      ' "$manifest" 2>/dev/null | head -1 || true)"
      [ -n "$install_path" ] && agents_dir="$install_path/agents"
    fi

    # Fall back to a glob when the manifest has no entry for this plugin.
    if [ -z "$agents_dir" ] && [ -n "${HOME:-}" ]; then
      for d in "${HOME:-}"/.claude/plugins/cache/*/"$plugin_name"/*/agents; do
        [ -d "$d" ] || continue
        agents_dir="$d"
        break
      done
    fi

    [ -n "$agents_dir" ] && agent_file="$(find_agent_file "$agents_dir" "$agent_name" || true)"
    ;;
  *)
    # A plain name resolves against the project agents dir, then the user's.
    if [ -n "$cwd" ]; then
      agent_file="$(find_agent_file "$cwd/.claude/agents" "$subagent_type" || true)"
    fi
    if [ -z "$agent_file" ] && [ -n "${HOME:-}" ]; then
      agent_file="$(find_agent_file "${HOME:-}/.claude/agents" "$subagent_type" || true)"
    fi
    ;;
esac

if [ -n "$agent_file" ] && has_model_key "$agent_file"; then
  exit 0
fi

deny
