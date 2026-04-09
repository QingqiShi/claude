#!/usr/bin/env bash
# aggregate.sh — Aggregate eval results into benchmark.json and report.html.
#
# Usage: aggregate.sh <output-directory>
#
# Finds all grading.json and judge.json files recursively under the output
# directory and produces benchmark.json and report.html.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: aggregate.sh <output-directory>" >&2
  exit 1
fi

OUTPUT_DIR="$1"

if [[ ! -d "$OUTPUT_DIR" ]]; then
  echo "Error: directory not found: $OUTPUT_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_JSON="$SCRIPT_DIR/../scenarios.json"

# --- Generate benchmark.json and report.html via python3 ---
python3 - "$OUTPUT_DIR" "$SCENARIOS_JSON" <<'PYEOF'
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

output_dir = Path(sys.argv[1])
scenarios_file = Path(sys.argv[2])

# Load scenario metadata for difficulty lookup
scenario_meta = {}
if scenarios_file.exists():
    with open(scenarios_file) as f:
        for s in json.load(f):
            scenario_meta[s["id"]] = s

# Find all grading.json files recursively
grading_files = sorted(output_dir.rglob("grading.json"))

runs = []
for gf in grading_files:
    run_dir = gf.parent
    rel_dir = str(run_dir.relative_to(output_dir))

    # Load grading.json
    with open(gf) as f:
        grading = json.load(f)

    detected_scenario = grading.get("detected_scenario", "none")
    pass_rate = grading.get("summary", {}).get("pass_rate", 0)

    # Load judge.json if present
    judge_file = run_dir / "judge.json"
    score = None
    summary = ""
    feedback = ""
    if judge_file.exists():
        with open(judge_file) as f:
            judge = json.load(f)
        score = judge.get("score")
        summary = judge.get("summary", "")
        feedback = judge.get("feedback", "")

    # Load changed_files.txt if present
    changed_files_path = run_dir / "changed_files.txt"
    changed_files = []
    if changed_files_path.exists():
        changed_files = [
            l.strip() for l in changed_files_path.read_text().splitlines() if l.strip()
        ]

    # Load diff.patch if present
    diff_path = run_dir / "diff.patch"
    diff_content = diff_path.read_text() if diff_path.exists() else ""

    # Load transcript.txt if present
    transcript_path = run_dir / "transcript.txt"
    transcript_content = transcript_path.read_text() if transcript_path.exists() else ""

    # Load usage.json if present
    usage_path = run_dir / "usage.json"
    usage = {}
    if usage_path.exists():
        with open(usage_path) as f:
            usage = json.load(f)

    runs.append({
        "dir": rel_dir,
        "scenario": detected_scenario,
        "score": score,
        "summary": summary,
        "feedback": feedback,
        "pass_rate": pass_rate,
        "changed_files": changed_files,
        "diff": diff_content,
        "transcript": transcript_content,
        "usage": usage,
    })

# --- Compute aggregates ---
total_runs = len(runs)
scenarios_covered = sorted(set(r["scenario"] for r in runs if r["scenario"] != "none"))
all_scenario_ids = sorted(scenario_meta.keys())
scenario_coverage = f"{len(scenarios_covered)}/{len(all_scenario_ids)}" if all_scenario_ids else f"{len(scenarios_covered)}/?"

scored_runs = [r for r in runs if r["score"] is not None]
average_score = round(sum(r["score"] for r in scored_runs) / len(scored_runs), 2) if scored_runs else 0

# False positive rate: runs that touched clean files
false_positive_count = 0
for r in runs:
    scenario_id = r["scenario"]
    if scenario_id != "none" and scenario_id in scenario_meta:
        clean_files = set(scenario_meta[scenario_id].get("clean_files", []))
        if clean_files & set(r["changed_files"]):
            false_positive_count += 1
    elif scenario_id == "none" and r["changed_files"]:
        # Changed files but detected no scenario — count as false positive
        false_positive_count += 1

false_positive_rate = round(false_positive_count / total_runs, 2) if total_runs else 0

# Compute total cost and tokens
total_cost = sum(r.get("usage", {}).get("total_cost_usd", 0) for r in runs)
total_input_tokens = sum(r.get("usage", {}).get("input_tokens", 0) for r in runs)
total_output_tokens = sum(r.get("usage", {}).get("output_tokens", 0) for r in runs)

benchmark = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "total_runs": total_runs,
    "scenarios_covered": scenarios_covered,
    "scenario_coverage": scenario_coverage,
    "average_score": average_score,
    "false_positive_rate": false_positive_rate,
    "total_cost_usd": round(total_cost, 4),
    "total_input_tokens": total_input_tokens,
    "total_output_tokens": total_output_tokens,
    "runs": runs,
}

# --- Write benchmark.json ---
benchmark_path = output_dir / "benchmark.json"
with open(benchmark_path, "w") as f:
    json.dump(benchmark, f, indent=2)
print(f"Wrote {benchmark_path}")

# --- Generate report.html ---

def score_color(score):
    if score is None:
        return "#999"  # grey
    if score >= 4:
        return "#2e7d32"  # green
    if score == 3:
        return "#f9a825"  # yellow
    return "#c62828"  # red

def score_bg(score):
    if score is None:
        return "#f5f5f5"
    if score >= 4:
        return "#e8f5e9"
    if score == 3:
        return "#fff8e1"
    return "#ffebee"

def esc(text):
    """HTML-escape a string."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )

def render_diff(diff_text):
    """Render a unified diff as syntax-highlighted HTML lines."""
    if not diff_text.strip():
        return "<em>No diff captured</em>"
    lines = []
    for line in diff_text.splitlines():
        escaped = esc(line)
        if line.startswith("+++") or line.startswith("---"):
            lines.append(f'<span class="diff-meta">{escaped}</span>')
        elif line.startswith("@@"):
            lines.append(f'<span class="diff-hunk">{escaped}</span>')
        elif line.startswith("diff --git"):
            lines.append(f'<span class="diff-file">{escaped}</span>')
        elif line.startswith("+"):
            lines.append(f'<span class="diff-add">{escaped}</span>')
        elif line.startswith("-"):
            lines.append(f'<span class="diff-del">{escaped}</span>')
        else:
            lines.append(escaped)
    return "\n".join(lines)

# Build run rows
run_rows = ""
for idx, r in enumerate(runs):
    sid = r["scenario"]
    difficulty = scenario_meta.get(sid, {}).get("difficulty", "-")
    sc = r["score"]
    bg = score_bg(sc)
    color = score_color(sc)
    score_display = str(sc) if sc is not None else "-"
    summary_text = esc(r["summary"]) if r["summary"] else "<em>No judge output</em>"
    diff_html = render_diff(r.get("diff", ""))
    feedback_html = esc(r.get("feedback", "")) if r.get("feedback") else ""
    transcript_html = esc(r.get("transcript", "")) if r.get("transcript") else ""
    usage = r.get("usage", {})
    cost = usage.get("total_cost_usd", 0)
    in_tok = usage.get("input_tokens", 0)
    out_tok = usage.get("output_tokens", 0)
    turns = usage.get("num_turns", 0)
    cost_display = f"${cost:.2f}" if cost else "-"
    tokens_display = f"{in_tok + out_tok:,} tok" if (in_tok or out_tok) else ""
    turns_display = f"{turns} turns" if turns else ""
    cost_detail = " / ".join(filter(None, [tokens_display, turns_display]))

    run_rows += f"""    <tr style="background:{bg}">
      <td>{esc(r['dir'])}</td>
      <td>{esc(sid)}</td>
      <td>{esc(difficulty)}</td>
      <td style="color:{color};font-weight:bold;text-align:center">{score_display}</td>
      <td style="text-align:right;white-space:nowrap"><div>{cost_display}</div><div style="font-size:0.75rem;color:#888">{cost_detail}</div></td>
      <td>
        {summary_text}
        <div class="detail-toggles">
          <details>
            <summary>Diff</summary>
            <pre class="diff-block">{diff_html}</pre>
          </details>"""
    if feedback_html:
        run_rows += f"""
          <details>
            <summary>Judge Feedback</summary>
            <div class="feedback-block">{feedback_html}</div>
          </details>"""
    if transcript_html:
        run_rows += f"""
          <details>
            <summary>Executor Transcript</summary>
            <pre class="transcript-block">{transcript_html}</pre>
          </details>"""
    run_rows += f"""
        </div>
      </td>
    </tr>
"""

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Auto-Improve Eval Report</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; background: #fafafa; padding: 2rem; }}
  h1 {{ font-size: 1.5rem; margin-bottom: 0.25rem; }}
  .timestamp {{ color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }}
  .stats {{ display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; }}
  .stat {{ background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1rem 1.5rem; min-width: 160px; }}
  .stat .label {{ font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }}
  .stat .value {{ font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }}
  table {{ width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }}
  th {{ background: #f5f5f5; text-align: left; padding: 0.75rem 1rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; border-bottom: 2px solid #e0e0e0; }}
  td {{ padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; vertical-align: top; }}
  tr:last-child td {{ border-bottom: none; }}
  .detail-toggles {{ margin-top: 0.5rem; }}
  details {{ margin-top: 0.4rem; }}
  details summary {{ cursor: pointer; font-size: 0.8rem; color: #555; font-weight: 600; user-select: none; }}
  details summary:hover {{ color: #1976d2; }}
  .diff-block {{ background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 6px; margin-top: 0.4rem; font-size: 0.8rem; line-height: 1.5; overflow-x: auto; max-height: 600px; overflow-y: auto; white-space: pre; }}
  .diff-file {{ color: #dcdcaa; font-weight: bold; }}
  .diff-meta {{ color: #808080; }}
  .diff-hunk {{ color: #569cd6; }}
  .diff-add {{ color: #4ec9b0; }}
  .diff-del {{ color: #f14c4c; }}
  .feedback-block {{ background: #f5f5f5; padding: 0.75rem; border-radius: 6px; margin-top: 0.4rem; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }}
  .transcript-block {{ background: #f5f5f5; padding: 0.75rem; border-radius: 6px; margin-top: 0.4rem; font-size: 0.8rem; line-height: 1.5; overflow-x: auto; max-height: 400px; overflow-y: auto; white-space: pre-wrap; }}
  .score-legend {{ margin-top: 1.5rem; font-size: 0.8rem; color: #888; }}
  .score-legend span {{ display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }}
</style>
</head>
<body>

<h1>Auto-Improve Eval Report</h1>
<div class="timestamp">{esc(benchmark['timestamp'])}</div>

<div class="stats">
  <div class="stat">
    <div class="label">Total Runs</div>
    <div class="value">{total_runs}</div>
  </div>
  <div class="stat">
    <div class="label">Scenario Coverage</div>
    <div class="value">{esc(scenario_coverage)}</div>
  </div>
  <div class="stat">
    <div class="label">Avg Judge Score</div>
    <div class="value" style="color:{score_color(round(average_score) if average_score else None)}">{average_score}</div>
  </div>
  <div class="stat">
    <div class="label">False Positive Rate</div>
    <div class="value">{false_positive_rate}</div>
  </div>
  <div class="stat">
    <div class="label">Total Cost</div>
    <div class="value">${round(total_cost, 2)}</div>
  </div>
  <div class="stat">
    <div class="label">Total Tokens</div>
    <div class="value" style="font-size:1.25rem">{total_input_tokens + total_output_tokens:,}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Run</th>
      <th>Scenario</th>
      <th>Difficulty</th>
      <th style="text-align:center">Score</th>
      <th style="text-align:right">Cost</th>
      <th>Summary</th>
    </tr>
  </thead>
  <tbody>
{run_rows}  </tbody>
</table>

<div class="score-legend">
  <span style="background:#2e7d32"></span> 4-5 (good)
  &nbsp;&nbsp;
  <span style="background:#f9a825"></span> 3 (partial)
  &nbsp;&nbsp;
  <span style="background:#c62828"></span> 1-2 (poor)
  &nbsp;&nbsp;
  <span style="background:#999"></span> No score
</div>

</body>
</html>"""

report_path = output_dir / "report.html"
with open(report_path, "w") as f:
    f.write(html)
print(f"Wrote {report_path}")

# Print summary to stdout
print(f"\n=== Aggregate Summary ===")
print(f"Total runs: {total_runs}")
print(f"Scenario coverage: {scenario_coverage}")
print(f"Average score: {average_score}")
print(f"False positive rate: {false_positive_rate}")
PYEOF
