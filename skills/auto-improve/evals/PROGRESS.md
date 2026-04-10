# Auto-Improve Eval Framework — Progress

## Skill Architecture

All 4 agents are long-lived team members communicating via SendMessage. Each delegates heavy work to sub-agents to manage context.

- **Explorer** — scans codebase via sub-agents, sends findings to Planner, sends code context directly to Executor when requested
- **Planner** — pure decision-maker, challenges Explorer, manages priority buffer, signals EXECUTE to Lead
- **Executor** — receives code from Explorer, delegates implementation to sub-agent, handles fix requests from Evaluator
- **Evaluator** — delegates review to sub-agent, talks to Executor for fixable issues (up to 3 rounds), raises PR via sub-agent, notifies Lead with CYCLE_COMPLETE
- **Lead** — creates team, manages worktree lifecycle, tracks cycle count

Reference files: `explorer.md`, `planner.md`, `executor.md`, `evaluator.md`.

## Harness Branches (6 orphan branches on GitHub)

Each branch contains a realistic Next.js 14 project with planted structural issues. `skills/` is in `.gitignore` so eval scripts can copy skill files at runtime.

- `eval/auto-improve-harness` — all 5 scenarios planted (for multi-cycle prioritization testing)
- `eval/auto-improve-scenario/1` through `/5` — one scenario each (for targeted detection testing)

Branches 2-5 and the combined harness have ThemeProvider + navigation already wired into layout.tsx to avoid distracting the skill with unplanted high-severity bugs.

### 5 Planted Scenarios

| # | ID | Issue | Difficulty |
|---|---|---|---|
| 1 | `duplicated-theme-state` | 3 components independently manage theme via localStorage + storage events. Fix: ThemeProvider context. | Medium |
| 2 | `scattered-derived-state` | 3 components + WelcomeBanner manage user prefs via scattered localStorage. Fix: UserContext provider. | Hard |
| 3 | `indirect-event-handler` | SearchResults uses useEffect watching filter props to fire API calls. Fix: move API calls to event handlers. | Hard |
| 4 | `monolithic-component` | DataTable is ~550 lines with inline sorting, filtering, pagination, selection, export. Fix: decompose. | Hard |
| 5 | `prop-drilling` | Dashboard prefs drilled through 4 levels. Middle components just forward props. Fix: DashboardContext. | Hard |

## Eval Scripts (`skills/auto-improve/evals/scripts/`)

| File | Purpose |
|---|---|
| `scenarios.json` | Scenario definitions (files, diff_patterns, difficulty) |
| `gh-shim.sh` | Intercepts `gh` commands, captures PR args and diff at creation time, stateful PR tracking |
| `git-shim.sh` | No-ops fetch/push/pull so origin/main stays at the harness commit |
| `check_assertions.sh` | Deterministic grading: signal detection, scenario matching, clean file checks |
| `judge-prompt.md` | System prompt for LLM judge (1-5 scoring rubric) |
| `judge.sh` | Runs `claude -p` with judge prompt for LLM scoring |
| `run-loop.sh` | Full auto-improve eval via tmux interactive session. Creates worktree, sets up shims, launches claude, polls for PR markers, captures JSONL transcripts, grades per-PR |
| `run-eval.sh` | Orchestrates multiple `run-loop.sh` runs (combined, per-scenario, or full matrix) |
| `aggregate.sh` | Generates `report.html` (with inline diff viewer) and `benchmark.json` from results |

## Key Learnings

1. **Agent teams don't work in `claude -p`** — the lead exits before teammates finish. tmux is the workaround.
2. **Harness needs to be very clean** — the executor consistently finds low-hanging fruit (a11y, missing providers) before structural issues. Fix unplanted bugs on scenario branches.
3. **Planted components must be rendered** — components that exist as files but aren't imported/rendered in any page are dead code. The evaluator correctly rejects fixes to dead code.
4. **`origin/main` shimming** — the skill does `git checkout origin/main` to reset. We set this ref to the harness commit and no-op `git fetch`.
5. **Diff capture timing** — the skill resets the worktree after each cycle. Must capture diff at `gh pr create` time inside the gh-shim.
6. **Transcript capture** — tmux screen scraping is unreliable. Use Claude Code's JSONL session files at `~/.claude/projects/<slug>/<session_id>.jsonl`.
7. **Project dir slug** — Claude Code replaces `/` and `.` with `-` in project dir names.

## Next Steps

1. **Run full matrix via run-loop.sh** — all 5 scenarios to establish baseline scores with the 4-agent team architecture
2. **Multi-cycle combined harness test** — run against `eval/auto-improve-harness` with cycles=5 to test scenario coverage across cycles
