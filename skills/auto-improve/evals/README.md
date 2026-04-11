# Auto-Improve Eval Framework

Measure the `auto-improve` skill against planted structural issues in Next.js harness projects.

## Running an eval

### Single scenario, single cycle

```
skills/auto-improve/evals/scripts/run-loop.sh \
  --branch eval/auto-improve-scenario/1 \
  --cycles 1 \
  --model opus \
  --timeout 2400
```

Scenarios live on GitHub as orphan branches:

| Branch | Contents |
|---|---|
| `eval/auto-improve-harness` | All 5 scenarios planted (multi-cycle prioritization) |
| `eval/auto-improve-scenario/1` | `duplicated-theme-state` |
| `eval/auto-improve-scenario/2` | `scattered-derived-state` |
| `eval/auto-improve-scenario/3` | `indirect-event-handler` |
| `eval/auto-improve-scenario/4` | `monolithic-component` |
| `eval/auto-improve-scenario/5` | `prop-drilling` |

### Full matrix

```
skills/auto-improve/evals/scripts/run-eval.sh
```

Orchestrates multiple `run-loop.sh` invocations, one per scenario.

## What the script does

1. Creates a git worktree under `~/.claude/worktrees/eval-auto-improve-<pid>/` from the chosen harness branch
2. Installs a PreToolUse hook into `$WORKTREE/.claude/` that intercepts `gh pr create/edit`, `gh label ...`, and `git push/pull/fetch` — so runs are hermetic and no real PRs leak to GitHub
3. Launches `claude` inside tmux (interactive mode is required for agent teams to work — `claude -p` exits before teammates finish)
4. Sends `/auto-improve <cycles>` to the session
5. Polls for `pr-raised-*` marker files until the target PR count is reached or the timeout hits
6. Captures session JSONLs (including sub-agent sessions under `<session_id>/subagents/`)
7. Grades via `check_assertions.sh` (deterministic) and `judge.sh` (LLM judge)
8. Computes cost/tokens from session JSONLs via `compute-usage.py`
9. Aggregates via `aggregate.sh` — produces `benchmark.json` and `report.html`
10. Opens `report.html` automatically

## Where the results land

```
skills/auto-improve/evals/results/loop-<timestamp>/
├── report.html          ← open this
├── benchmark.json       ← aggregate metrics (cost, tokens, scores)
├── usage.json           ← token/cost breakdown by model
├── grading.json         ← deterministic assertions (first PR)
├── judge.json           ← LLM judge score + feedback (first PR)
├── diff.patch           ← what the skill changed
├── changed_files.txt
├── transcript.txt       ← assembled from all session JSONLs
├── sessions/            ← raw JSONLs (team + sub-agents)
└── pr-raised-*          ← marker files written by gh-shim
```

## Reading the results — rules for agents

**Always open `report.html` for the user.** `run-loop.sh` opens it automatically on macOS; if for any reason that fails, surface the file path and ask the user to open it. Do NOT paraphrase `benchmark.json` into a text summary as the primary answer — the HTML renders the diff, judge feedback, and cost better than any text you can produce. A text summary is a supplement, not a substitute.

**Cost vs. quality have to be read together.** `benchmark.json` surfaces `total_cost_usd`, `average_score`, and `false_positive_rate`. A skill change that drops cost but drops quality is a regression. A skill change that drops cost and preserves quality is a win.

**False positive rate ≠ architectural regression.** `check_assertions.sh` flags any modification to a file not in the planted scenario's `clean_files` list. That includes thoughtful utility extensions that compose cleanly with a new feature — the deterministic rule can't distinguish scope creep from good factoring. When the deterministic grader flags a false positive but the judge scores 5/5, read the judge's feedback carefully before calling it a regression.

## Comparing runs

Each `results/loop-<timestamp>/` directory is self-contained and reproducible. To compare two runs:

```
open skills/auto-improve/evals/results/loop-<A>/report.html
open skills/auto-improve/evals/results/loop-<B>/report.html
```

`benchmark.json` fields useful for cross-run comparison: `total_cost_usd`, `average_score`, `false_positive_rate`, `total_input_tokens`, `total_output_tokens`. The per-run `usage.json` has the full model/cache-tier breakdown.

## Gotchas

- **Skills are snapshotted at `$WORKTREE/.claude/skills/`, not `$WORKTREE/skills/`.** The `.claude/skills/` path is Claude Code's project-local skill discovery location, which takes precedence over global `~/.claude/skills/`. This makes the eval hermetic — editing the global skill mid-run does NOT affect an in-flight evaluation. If you see the older `$WORKTREE/skills/` path anywhere, it's dead code; the agent never reads from there.
- **Harness branches' `.gitignore` excludes `.claude/`** so the hook infra and snapshotted skills don't trip the skill's pre-cycle reset gate (`git status --porcelain` must be empty). All 6 harness branches carry this since commit `21c02fa` / `b5acab5` / `ba44f56` / `24212dc` / `8c5f752` / `de9501f`.
- **Sub-agent sessions live under `<session_id>/subagents/`.** `run-loop.sh` uses rsync to capture the full tree — a flat `cp *.jsonl` will miss ~30% of the token activity.
- **`claude -p` doesn't work for agent teams.** The lead exits before teammates finish. The harness uses tmux interactive mode specifically for this reason.
- **Sonnet paraphrases skill templates.** Use Opus for faithful-instruction measurement; Sonnet is a separate robustness test.

## Backfilling old runs

If a run pre-dates `compute-usage.py`, you can backfill its cost retroactively:

```
python3 skills/auto-improve/evals/scripts/compute-usage.py \
  skills/auto-improve/evals/results/loop-<ts>/sessions \
  skills/auto-improve/evals/results/loop-<ts>/usage.json
skills/auto-improve/evals/scripts/aggregate.sh \
  skills/auto-improve/evals/results/loop-<ts>
```

If the `results/<run>/sessions/` directory is missing sub-agent sessions (older runs from before the rsync fix), point `compute-usage.py` at the original project dir instead:

```
python3 skills/auto-improve/evals/scripts/compute-usage.py \
  ~/.claude/projects/-Users-qingqishi--claude-worktrees-eval-auto-improve-<pid> \
  skills/auto-improve/evals/results/loop-<ts>/usage.json
```
