# Auto-Improve Eval Framework — Progress

## What's Built

### Harness Branches (6 orphan branches on GitHub)

Each branch contains a realistic Next.js 14 project with planted structural issues. `skills/` is in `.gitignore` so eval scripts can copy skill files at runtime without polluting diffs.

- `eval/auto-improve-harness` — all 5 scenarios planted (for multi-cycle prioritization testing)
- `eval/auto-improve-scenario/1` through `/5` — one scenario each (for targeted detection testing)

Each branch has a single squashed commit.

### 5 Planted Scenarios

| # | ID | Issue | Difficulty |
|---|---|---|---|
| 1 | `duplicated-theme-state` | 3 components independently manage theme via localStorage + storage events. Fix: ThemeProvider context. | Medium |
| 2 | `scattered-derived-state` | 3 components + WelcomeBanner manage user prefs via scattered localStorage. Fix: UserContext provider. | Hard |
| 3 | `indirect-event-handler` | SearchResults uses useEffect watching filter props to fire API calls. Fix: move API calls to event handlers. | Hard |
| 4 | `monolithic-component` | DataTable is ~550 lines with inline sorting, filtering, pagination, selection, export. Fix: decompose. | Hard |
| 5 | `prop-drilling` | Dashboard prefs drilled through 4 levels. Middle components just forward props. Fix: DashboardContext. | Hard |

The harness also contains **unplanted but real issues** (a11y gaps, minor UX issues) intentionally left in to test whether the skill prioritizes structural improvements over cosmetic ones.

### Eval Scripts (`skills/auto-improve/evals/scripts/`)

| File | Status | Purpose |
|---|---|---|
| `scenarios.json` | Done | Scenario definitions (files, diff_patterns, difficulty) |
| `gh-shim.sh` | Done | Intercepts gh commands, captures PR args, stateful PR tracking across cycles, captures diff at PR creation time |
| `git-shim.sh` | Done | No-ops fetch/push/pull so origin/main stays pointed at the harness commit |
| `check_assertions.sh` | Done | Deterministic grading: signal detection, scenario matching, clean file checks |
| `judge-prompt.md` | Done | System prompt for LLM judge (1-5 scoring rubric) |
| `judge.sh` | Done | Runs claude -p with judge prompt for LLM scoring |
| `run-single.sh` | Done | Executor-only eval via `claude -p` (no team, no evaluator). Used for per-scenario targeted testing. |
| `run-eval.sh` | Done | Orchestrates multiple `run-single.sh` runs (combined, per-scenario, or full matrix) |
| `aggregate.sh` | Done | Generates `report.html` (with inline diff viewer) and `benchmark.json` from results |
| `run-loop.sh` | **In progress** | Full auto-improve loop via tmux (see below) |

### Report Features

`report.html` is self-contained (inline CSS) with:
- Summary cards: total runs, scenario coverage, avg score, false positive rate, total cost, total tokens
- Per-run table: scenario, difficulty, score (color-coded), cost/tokens/turns, summary
- Expandable sections: diff (syntax-highlighted), judge feedback, executor transcript

## Skill Architecture (Current)

Rewritten from sequential subagents to agent teams:

- **Explorer** (long-lived team agent) — continuously scans codebase, sends findings to Planner
- **Planner** (long-lived team agent) — 5-slot priority buffer, challenges findings, tells Explorer to pause/resume, signals Lead when ready to execute. Uses subagents for heavy work.
- **Executor** (short-lived subagent) — receives brief from Planner, implements in a fresh worktree, dies after
- **Evaluator** (short-lived subagent) — reviews executor's work, raises PR or rejects, dies after
- **Lead** — creates team, monitors for Planner's EXECUTE signal, spawns Executor/Evaluator per cycle, manages worktree lifecycle

Reference files: `explorer.md`, `planner.md`, `executor.md`, `evaluator.md`. `maintainer.md` was removed (folded into Planner's subagent work).

## What Works

- **`run-single.sh`** (executor-only via `claude -p`): Fully working. Runs executor against a scenario branch, grades with deterministic checks + LLM judge, produces report with diff/transcript/usage.
- **`run-eval.sh`**: Fully working. Runs matrix of all 5 scenarios. Last full run: scenario 1 scored 5/5, scenarios 2-5 scored 1/5 (found a11y issues instead of planted structural issues).
- **Harness branches**: Verified correct. Buggy/clean file placement confirmed. localStorage error handling and search debounce issues were fixed to reduce false positives.

## What's In Progress

### `run-loop.sh` — tmux-based full loop runner

**Why tmux**: Agent teams don't work in `claude -p` (non-interactive mode). The lead exits after 2-3 turns before teammates finish. Confirmed via testing and official docs/GitHub issues. tmux provides a persistent interactive session where teams work properly.

**Current approach**:
1. Create worktree from harness branch
2. Set up git-shim and gh-shim on PATH, export `REAL_GIT` env var
3. Copy skill files into worktree (gitignored)
4. Set `origin/main` ref to harness commit
5. Launch `claude --permission-mode bypassPermissions` in a detached tmux session
6. Send `/auto-improve N` via `tmux send-keys`
7. Poll for PR marker files (touched by gh-shim on `gh pr create`)
8. When target PR count reached (or timeout), capture tmux scrollback as transcript
9. Send `/exit`, kill tmux session
10. Grade each PR using per-PR diff files captured by gh-shim

**What works**:
- tmux session launches claude correctly
- Prompt sending works
- PR marker detection works (tested: detected PR at ~456s)
- Agent team starts (Explorer + Planner created, reference files read)
- Skill runs the full cycle and raises a PR
- **Diff capture** — fixed. `REAL_GIT` env var passed from run-loop.sh to gh-shim, bypassing fragile `which -a` discovery. Tested: diff and changed_files correctly captured in worktree context.
- **Per-PR grading** — gh-shim writes `diff-N.patch` and `changed_files-N.txt` per PR. run-loop.sh grades each PR individually and passes captured changed_files to check_assertions.sh (5th arg override) so it doesn't inspect the already-reset worktree.

## Key Learnings

1. **Agent teams don't work in `claude -p`** — the lead exits before teammates finish. This is a known limitation (GitHub issue #1124). tmux is the workaround.

2. **CronCreate is session-scoped** — in `claude -p`, it "succeeds" but the trigger never fires (session ends first). In tmux interactive mode, it would fire but we don't rely on it — the eval controls cycle count externally.

3. **Harness needs to be very clean** — the executor consistently finds low-hanging fruit (a11y, localStorage error handling, missing debounce) before structural issues. Fixed localStorage and debounce, deliberately left a11y issues to test prioritization.

4. **`origin/main` shimming** — the skill does `git checkout origin/main` to reset. We set this ref to the harness commit and no-op `git fetch` so it doesn't get overwritten.

5. **Diff capture timing** — the skill resets the worktree after each cycle, so capturing diff post-cycle gives empty results. Must capture at `gh pr create` time inside the gh-shim.

6. **Shim real binary discovery** — `which -a git | grep -v "$0"` fails when `$0` doesn't resolve to the full path (e.g. `dirname "gh"` = `.`, and `grep -v "."` filters everything). Fix: resolve `dirname` with `cd && pwd`, use `grep -vF` for literal match, and pass `REAL_GIT` env var from the runner.

7. **check_assertions.sh worktree vs captured state** — the assertion script inspects the worktree for changed files and overwrites `changed_files.txt`. In run-loop.sh, the worktree is already reset by the skill. Fix: accept a 5th arg (`changed_files_override`) to use pre-captured file lists instead.

## Next Steps

1. **Verify full loop end-to-end** — run `run-loop.sh --branch eval/auto-improve-scenario/1 --cycles 1` and confirm grading produces a scored report with diff
2. **Run full matrix** — all 5 scenarios via run-loop.sh to establish baseline scores
3. **Optimize skill instructions** — tune explorer.md and planner.md to prioritize structural issues over cosmetic ones
4. **Multi-cycle combined harness test** — run against `eval/auto-improve-harness` with cycles=5 to test scenario coverage across cycles
