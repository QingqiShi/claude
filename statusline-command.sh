#!/usr/bin/env bash
# Claude Code status line script

input=$(cat)

# --- Fields from stdin, one jq call, one value per line ---
fields=$(printf '%s' "$input" | jq -r '[
  (.model.display_name // "Unknown model"),
  (.effort.level // ""),
  (.workspace.current_dir // .cwd // ""),
  (.workspace.project_dir // .workspace.current_dir // .cwd // ""),
  (.cost.total_cost_usd // ""),
  (.cost.total_lines_added // ""),
  (.cost.total_lines_removed // ""),
  (.context_window.used_percentage // ""),
  (.rate_limits.five_hour.used_percentage // ""),
  (.prompt_cache.warm | if . == null then "" else tostring end)
] | map(tostring) | .[]')
{
  read -r model
  read -r effort
  read -r cwd
  read -r project_dir
  read -r raw_cost
  read -r added
  read -r removed
  read -r used_pct
  read -r limit_pct
  read -r cache_warm
} <<< "$fields"

# --- Git ---
branch=""
dirty=""
ahead=""
if [ -n "$cwd" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi
if [ -n "$branch" ]; then
  if [ -n "$(git -C "$cwd" --no-optional-locks status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    dirty="*"
  fi
  ahead=$(git -C "$cwd" --no-optional-locks rev-list --count '@{upstream}..HEAD' 2>/dev/null)
  [ "${ahead:-0}" != 0 ] || ahead=""
fi
repo=""
if [ -n "$project_dir" ]; then
  repo=$(basename "$project_dir")
fi

# --- Width tier ---
# Claude Code sets COLUMNS to the terminal width and draws the footer with a
# margin of 2 columns on each side. Without COLUMNS, keep one wide row.
if [[ ${COLUMNS:-} =~ ^[1-9][0-9]*$ ]]; then
  cols=$COLUMNS
else
  cols=1000
fi
budget=$(( cols - 4 ))
if (( cols >= 90 )); then
  tier=wide
elif (( cols >= 60 )); then
  tier=medium
else
  tier=narrow
fi

# --- Palette (24-bit) ---
ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
NOBOLD="${ESC}[22m"
DEFBG="${ESC}[49m"
ARROW=$'\xee\x82\xb0'
F="${ESC}[38;2;"
B="${ESC}[48;2;"
INK="11;14;20"
INK_SOFT="74;84;104"
FG="213;219;230"
MUTED="139;149;167"
TRACK="58;67;84"
ACC="168;184;220"
G0="44;52;68"
G1="35;42;56"
G2="27;32;43"
OK="143;191;159"
WARN="217;181;124"
BAD="224;138;138"

mix() {  # mix VAR FROM TO STEP STEPS
  local a0 a1 a2 b0 b1 b2
  IFS=';' read -r a0 a1 a2 <<< "$2"
  IFS=';' read -r b0 b1 b2 <<< "$3"
  printf -v "$1" '%d;%d;%d' \
    $(( a0 + (b0 - a0) * $4 / $5 )) \
    $(( a1 + (b1 - a1) * $4 / $5 )) \
    $(( a2 + (b2 - a2) * $4 / $5 ))
}

gradient_bar() {  # gradient_bar VAR CELLS PCT
  local cells=$2 pct=$3 filled i c out=""
  filled=$(( (pct * cells + 50) / 100 ))
  for (( i = 0; i < cells; i++ )); do
    if (( i < filled )); then
      if (( 2 * i <= cells - 1 )); then
        mix c "$OK" "$WARN" $(( 2 * i )) $(( cells - 1 ))
      else
        mix c "$WARN" "$BAD" $(( 2 * i - cells + 1 )) $(( cells - 1 ))
      fi
      out+="${F}${c}m█"
    else
      out+="${F}${TRACK}m█"
    fi
  done
  printf -v "$1" '%s' "$out"
}

shorten() {  # shorten VAR NAME MAX
  local name=$2 max=$3 head="" room cut keep i
  if (( ${#name} <= max )); then
    printf -v "$1" '%s' "$name"
    return
  fi
  # Directory parts collapse to one letter: docs/foo -> d/foo
  while [[ $name == */* ]]; do
    head+="${name:0:1}/"
    name=${name#*/}
  done
  room=$(( max - ${#head} ))
  (( room < 4 )) && room=4
  if (( ${#name} <= room )); then
    printf -v "$1" '%s' "${head}${name}"
    return
  fi
  # Cut the last part at the last word boundary that fits, else hard.
  cut=$(( room - 1 ))
  keep=0
  for (( i = 1; i <= cut; i++ )); do
    case ${name:i:1} in -|_|.) keep=$i ;; esac
  done
  (( keep < 3 )) && keep=$cut
  printf -v "$1" '%s' "${head}${name:0:keep}…"
}

# --- Segments: coloured text and its display width in cells ---
seg_text=()
seg_w=()
add_seg() {
  seg_text+=("$1")
  seg_w+=("$2")
}

# Model and effort
nbolts=0
eff=$effort
case $effort in
  low)    nbolts=1; eff=lo ;;
  medium) nbolts=2; eff=md ;;
  high)   nbolts=3; eff=hi ;;
  xhigh)  nbolts=4; eff=xh ;;
  max)    nbolts=5; eff=mx ;;
esac
bolts=""
for (( i = 0; i < nbolts; i++ )); do bolts+="⚡"; done
short_model=${model%% *}
if [ "$tier" = wide ]; then
  text="${F}${INK}m🧠 ${BOLD}${model}${NOBOLD}"
  w=$(( 3 + ${#model} ))
  if (( nbolts > 0 )); then
    text+=" ${bolts}"
    w=$(( w + 1 + 2 * nbolts ))
  elif [ -n "$eff" ]; then
    text+=" ${eff}"
    w=$(( w + 1 + ${#eff} ))
  fi
else
  text="${F}${INK}m${BOLD}${short_model}${NOBOLD}"
  w=${#short_model}
  if [ -n "$eff" ]; then
    text+="${F}${INK_SOFT}m·${eff}"
    w=$(( w + 1 + ${#eff} ))
  fi
fi
add_seg "$text" "$w"

# Repository and branch, with short names on small screens
if [ -n "$branch" ]; then
  case $tier in
    wide)
      overhead=$(( 3 + ${#repo} + 4 + ${#dirty} + 3 ))
      [ -n "$ahead" ] && overhead=$(( overhead + 2 + ${#ahead} ))
      room=$(( budget - overhead ))
      (( room < 12 )) && room=12
      ;;
    medium) room=24 ;;
    *)      room=16 ;;
  esac
  shorten branch "$branch" "$room"
fi
if [ "$tier" = medium ] && [ -n "$repo" ]; then
  shorten repo "$repo" 12
fi
text=""
w=0
if [ "$tier" = wide ]; then
  if [ -n "$repo" ]; then
    text="${F}${MUTED}m📦 ${repo}"
    w=$(( 3 + ${#repo} ))
  fi
  if [ -n "$branch" ]; then
    [ -n "$text" ] && { text+=" "; w=$(( w + 1 )); }
    text+="${F}${ACC}m🌿 ${branch}"
    w=$(( w + 3 + ${#branch} ))
  fi
elif [ "$tier" = medium ]; then
  if [ -n "$repo" ]; then
    text="${F}${MUTED}m${repo}"
    w=${#repo}
    [ -n "$branch" ] && { text+="/"; w=$(( w + 1 )); }
  fi
  if [ -n "$branch" ]; then
    text+="${F}${ACC}m${branch}"
    w=$(( w + ${#branch} ))
  fi
elif [ -n "$branch" ]; then
  text="${F}${ACC}m${branch}"
  w=${#branch}
elif [ -n "$repo" ]; then
  text="${F}${MUTED}m${repo}"
  w=${#repo}
fi
if [ -n "$branch" ]; then
  if [ -n "$dirty" ]; then
    text+="${F}${WARN}m*"
    w=$(( w + 1 ))
  fi
  if [ "$tier" = wide ] && [ -n "$ahead" ]; then
    text+="${F}${MUTED}m ↑${ahead}"
    w=$(( w + 2 + ${#ahead} ))
  fi
fi
[ -n "$text" ] && add_seg "$text" "$w"

# Lines changed and cache warmth (wide only)
if [ "$tier" = wide ]; then
  text=""
  w=0
  if [ -n "$added" ] && [ -n "$removed" ] && [ "${added}${removed}" != 00 ]; then
    text="${F}${OK}m+${added} ${F}${BAD}m−${removed}"
    w=$(( 3 + ${#added} + ${#removed} ))
  fi
  if [ -n "$cache_warm" ]; then
    [ -n "$text" ] && { text+="  "; w=$(( w + 2 )); }
    if [ "$cache_warm" = true ]; then
      text+="${F}${ACC}m◉${F}${MUTED}m warm"
    else
      text+="${F}${MUTED}m○ cold"
    fi
    w=$(( w + 6 ))
  fi
  [ -n "$text" ] && add_seg "$text" "$w"
fi

# Five-hour rate limit, once it passes half (not on phones)
if [ "$tier" != narrow ] && [ -n "$limit_pct" ]; then
  limit_int=$(printf '%.0f' "$limit_pct")
  if (( limit_int >= 50 )); then
    col=$WARN
    (( limit_int >= 85 )) && col=$BAD
    add_seg "${F}${MUTED}m5h ${F}${col}m${limit_int}%" $(( 4 + ${#limit_int} ))
  fi
fi

# Session cost (client-side estimate from stdin)
if [ -n "$raw_cost" ]; then
  cost=$(printf '$%.2f' "$raw_cost")
else
  cost='$0.00'
fi
if [ "$tier" = wide ]; then
  add_seg "${F}${FG}m💰 ${cost}" $(( 3 + ${#cost} ))
else
  add_seg "${F}${FG}m${cost}" "${#cost}"
fi

# Context meter
case $tier in
  wide)   cells=20 ;;
  medium) cells=10 ;;
  *)      cells=5 ;;
esac
if [ -n "$used_pct" ]; then
  used_int=$(printf '%.0f' "$used_pct")
  pct_text="${used_int}%"
  if (( used_int >= 85 )); then
    pct_ansi="${BOLD}${F}${BAD}m${pct_text}${NOBOLD}"
  elif (( used_int >= 60 )); then
    pct_ansi="${F}${WARN}m${pct_text}"
  else
    pct_ansi="${F}${OK}m${pct_text}"
  fi
else
  used_int=0
  pct_text="-"
  pct_ansi="${F}${MUTED}m-"
fi
# Halve the bar once when that keeps the meter on the same row.
used_w=0
for w in "${seg_w[@]}"; do used_w=$(( used_w + w + 3 )); done
if (( cells > 5 && used_w + cells + 4 + ${#pct_text} > budget && used_w + cells / 2 + 4 + ${#pct_text} <= budget )); then
  cells=$(( cells / 2 ))
fi
gradient_bar bar "$cells" "$used_int"
add_seg "${bar} ${pct_ansi}" $(( cells + 1 + ${#pct_text} ))

# --- Backgrounds: accent, then greys that step toward the terminal background ---
n=${#seg_text[@]}
seg_bg=()
for (( i = 0; i < n; i++ )); do
  if (( i == 0 )); then
    seg_bg+=("$ACC")
  elif (( i == n - 1 )); then
    seg_bg+=("$G2")
  elif (( n <= 3 )); then
    seg_bg+=("$G0")
  else
    mix c "$G0" "$G1" $(( i - 1 )) $(( n - 3 ))
    seg_bg+=("$c")
  fi
done

# --- Pack the segments into rows that fit the budget ---
# Claude Code draws the status line dim. The reset at the start of each row
# cancels that. The join glyph is a Powerline arrow (U+E0B0): the terminal
# font must include it.
rows=()
row=""
row_w=0
prev_bg=""
for (( i = 0; i < n; i++ )); do
  w=$(( seg_w[i] + 3 ))
  if [ -n "$row" ] && (( row_w + w > budget )); then
    rows+=("${row}${DEFBG}${F}${prev_bg}m${ARROW}${RESET}")
    row=""
    row_w=0
  fi
  if [ -z "$row" ]; then
    row=$RESET
  else
    row+="${B}${seg_bg[i]}m${F}${prev_bg}m${ARROW}"
  fi
  row+="${B}${seg_bg[i]}m ${seg_text[i]} "
  row_w=$(( row_w + w ))
  prev_bg=${seg_bg[i]}
done
rows+=("${row}${DEFBG}${F}${prev_bg}m${ARROW}${RESET}")

IFS=$'\n'
printf '%s' "${rows[*]}"
