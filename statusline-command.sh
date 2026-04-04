#!/usr/bin/env bash
# Claude Code status line script

input=$(cat)

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // "Unknown model"')

# --- Git branch ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
branch=""
if [ -n "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi

# --- Repository name (basename of project_dir or current_dir) ---
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // .workspace.current_dir // .cwd // ""')
repo=""
if [ -n "$project_dir" ]; then
  repo=$(basename "$project_dir")
fi

# --- Today's cost via ccusage ---
today=$(date +"%Y-%m-%d")
raw_cost=$(pnpm dlx ccusage daily --json 2>/dev/null | jq -r --arg d "$today" '.daily[] | select(.date == $d) | .totalCost')
if [ -n "$raw_cost" ]; then
  cost=$(printf '$%.2f' "$raw_cost")
else
  cost='$0.00'
fi

# --- Context progress bar ---
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$used_pct" ]; then
  # Round to integer
  used_int=$(printf "%.0f" "$used_pct")
  bar_width=10
  filled=$(( used_int * bar_width / 100 ))
  empty=$(( bar_width - filled ))
  bar=""
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty);  do bar="${bar}░"; done
  ctx_part="[${bar}] ${used_int}%"
else
  ctx_part="[░░░░░░░░░░] -"
fi

# --- Assemble ---
parts=()
[ -n "$model" ]  && parts+=("🧠 $model")
[ -n "$repo" ]   && parts+=("📦 $repo")
[ -n "$branch" ] && parts+=("🌿 $branch")
parts+=("💰 $cost")
parts+=("🧱 $ctx_part")

# Join with " | " separator using printf
output=""
for part in "${parts[@]}"; do
  if [ -z "$output" ]; then
    output="$part"
  else
    output="$output | $part"
  fi
done

printf "%s" "$output"
