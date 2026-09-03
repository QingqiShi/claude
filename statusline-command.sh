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
branch_full=""
dirty=""
ahead=""
if [ -n "$cwd" ]; then
  branch_full=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi
if [ -n "$branch_full" ]; then
  if [ -n "$(git -C "$cwd" --no-optional-locks status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    dirty="*"
  fi
  ahead=$(git -C "$cwd" --no-optional-locks rev-list --count '@{upstream}..HEAD' 2>/dev/null)
  [ "${ahead:-0}" != 0 ] || ahead=""
fi
repo_full=""
if [ -n "$project_dir" ]; then
  repo_full=$(basename "$project_dir")
fi

# --- Width budget ---
# Claude Code sets COLUMNS to the terminal width and draws the footer with a
# margin of 2 columns on each side. Without COLUMNS, show the full row.
if [[ ${COLUMNS:-} =~ ^[1-9][0-9]*$ ]]; then
  budget=$(( COLUMNS - 4 ))
else
  budget=1000
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
  local a=$2 b=$3 a0 a1 a2 b0 b1 b2
  a0=${a%%;*}; a=${a#*;}; a1=${a%%;*}; a2=${a#*;}
  b0=${b%%;*}; b=${b#*;}; b1=${b%%;*}; b2=${b#*;}
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

# --- Values that do not change with the width ---
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
model_short=${model#Claude }
model_family=${model_short%% *}

if [ -n "$raw_cost" ]; then
  cost=$(printf '$%.2f' "$raw_cost")
else
  cost='$0.00'
fi

limit_int=""
[ -n "$limit_pct" ] && limit_int=$(printf '%.0f' "$limit_pct")

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

# --- Segments: coloured text and its display width in cells ---
# The row stays on one line. When the full row does not fit, the fit steps
# below apply one by one, in order, until it does: first the decorations go,
# then the names get shorter, and only then does information get hidden.
steps=(bar10 icons model2 effort names model1 branch16 bar5 branch12 cache limit85 lines repo cost branch8 bar0 branch0)

seg_text=()
seg_w=()
total=0
bars=()
add_seg() {
  seg_text+=("$1")
  seg_w+=("$2")
  total=$(( total + $2 + 3 ))
}

build_row() {  # build_row STEPS BRANCH_MAX
  local i text w name col bar
  local icons=1 model_len=3 effort_style=bolts bar_cells=20 limit_min=50
  local show_cache=1 show_lines=1 show_repo=1 show_branch=1 show_cost=1
  local repo_max=0 branch_max=$2
  for (( i = 0; i < $1; i++ )); do
    case ${steps[i]} in
      bar10)    bar_cells=10 ;;
      icons)    icons=0 ;;
      model2)   model_len=2 ;;
      effort)   effort_style=text ;;
      names)    repo_max=12; branch_max=24 ;;
      model1)   model_len=1 ;;
      branch16) branch_max=16 ;;
      bar5)     bar_cells=5 ;;
      branch12) branch_max=12 ;;
      cache)    show_cache=0 ;;
      limit85)  limit_min=85 ;;
      lines)    show_lines=0 ;;
      repo)     show_repo=0 ;;
      cost)     show_cost=0 ;;
      branch8)  branch_max=8 ;;
      bar0)     bar_cells=0 ;;
      branch0)  show_branch=0 ;;
    esac
  done
  seg_text=()
  seg_w=()
  total=0

  # Model and effort
  case $model_len in
    3) name=$model ;;
    2) name=$model_short ;;
    *) name=$model_family ;;
  esac
  text="${F}${INK}m"
  w=0
  if (( icons )); then
    text+="🧠 "
    w=3
  fi
  text+="${BOLD}${name}${NOBOLD}"
  w=$(( w + ${#name} ))
  if [ "$effort_style" = bolts ] && (( nbolts > 0 )); then
    text+=" ${bolts}"
    w=$(( w + 1 + 2 * nbolts ))
  elif [ -n "$eff" ]; then
    text+="${F}${INK_SOFT}m·${eff}"
    w=$(( w + 1 + ${#eff} ))
  fi
  add_seg "$text" "$w"

  # Repository and branch
  local repo=$repo_full branch=$branch_full
  (( show_repo )) || repo=""
  (( show_branch )) || branch=""
  if [ -n "$repo" ] && (( repo_max > 0 )); then
    shorten repo "$repo" "$repo_max"
  fi
  [ -n "$branch" ] && shorten branch "$branch" "$branch_max"
  text=""
  w=0
  if [ -n "$repo" ]; then
    if (( icons )); then
      text="${F}${MUTED}m📦 ${repo}"
      w=$(( 3 + ${#repo} ))
    else
      text="${F}${MUTED}m${repo}"
      w=${#repo}
    fi
  fi
  if [ -n "$branch" ]; then
    if [ -n "$text" ]; then
      if (( icons )); then text+=" "; else text+="/"; fi
      w=$(( w + 1 ))
    fi
    if (( icons )); then
      text+="${F}${ACC}m🌿 ${branch}"
      w=$(( w + 3 + ${#branch} ))
    else
      text+="${F}${ACC}m${branch}"
      w=$(( w + ${#branch} ))
    fi
    if [ -n "$dirty" ]; then
      text+="${F}${WARN}m*"
      w=$(( w + 1 ))
    fi
    if [ -n "$ahead" ]; then
      text+="${F}${MUTED}m ↑${ahead}"
      w=$(( w + 2 + ${#ahead} ))
    fi
  fi
  [ -n "$text" ] && add_seg "$text" "$w"

  # Lines changed and cache warmth
  text=""
  w=0
  if (( show_lines )) && [ -n "$added" ] && [ -n "$removed" ] && [ "${added}${removed}" != 00 ]; then
    text="${F}${OK}m+${added} ${F}${BAD}m−${removed}"
    w=$(( 3 + ${#added} + ${#removed} ))
  fi
  if (( show_cache )) && [ -n "$cache_warm" ]; then
    [ -n "$text" ] && { text+="  "; w=$(( w + 2 )); }
    if [ "$cache_warm" = true ]; then
      text+="${F}${ACC}m◉${F}${MUTED}m warm"
    else
      text+="${F}${MUTED}m○ cold"
    fi
    w=$(( w + 6 ))
  fi
  [ -n "$text" ] && add_seg "$text" "$w"

  # Five-hour rate limit, once it passes the threshold
  if [ -n "$limit_int" ] && (( limit_int >= limit_min )); then
    col=$WARN
    (( limit_int >= 85 )) && col=$BAD
    add_seg "${F}${MUTED}m5h ${F}${col}m${limit_int}%" $(( 4 + ${#limit_int} ))
  fi

  # Session cost (client-side estimate from stdin)
  if (( show_cost )); then
    if (( icons )); then
      add_seg "${F}${FG}m💰 ${cost}" $(( 3 + ${#cost} ))
    else
      add_seg "${F}${FG}m${cost}" "${#cost}"
    fi
  fi

  # Context meter
  if (( bar_cells > 0 )); then
    if [ -z "${bars[bar_cells]}" ]; then
      gradient_bar bar "$bar_cells" "$used_int"
      bars[bar_cells]=$bar
    fi
    add_seg "${bars[bar_cells]} ${pct_ansi}" $(( bar_cells + 1 + ${#pct_text} ))
  else
    add_seg "$pct_ansi" "${#pct_text}"
  fi
}

# The full branch name gets the free room, but at least 24 cells, before the
# fit steps trim anything else.
build_row 0 1000
if (( total > budget )); then
  branch_room=$(( ${#branch_full} - (total - budget) ))
  (( branch_room < 24 )) && branch_room=24
  for (( k = 0; k <= ${#steps[@]}; k++ )); do
    build_row "$k" "$branch_room"
    (( total <= budget )) && break
  done
fi

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

# --- One row ---
# Claude Code draws the status line dim. The reset at the start of the row
# cancels that. The join glyph is a Powerline arrow (U+E0B0): the terminal
# font must include it.
row=$RESET
prev_bg=""
for (( i = 0; i < n; i++ )); do
  [ -n "$prev_bg" ] && row+="${B}${seg_bg[i]}m${F}${prev_bg}m${ARROW}"
  row+="${B}${seg_bg[i]}m ${seg_text[i]} "
  prev_bg=${seg_bg[i]}
done
row+="${DEFBG}${F}${prev_bg}m${ARROW}${RESET}"
printf '%s' "$row"
