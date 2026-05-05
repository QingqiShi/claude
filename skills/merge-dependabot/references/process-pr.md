# Process a single Dependabot PR

You are a sub-agent processing one Dependabot PR as part of a larger orchestration. The orchestrator has given you four values in the spawn prompt: PR number (`<number>`), head branch (`<head-branch>`), default branch (`<default-branch>`), and package manager (`<package-manager>`). Use them throughout this file.

When you finish, report the outcome briefly to the orchestrator: the PR was merged, was skipped (with the reason), or work stopped because something needs human attention (with what's blocking).

## Steps

**1. Rebase the PR branch locally.**

```bash
git fetch origin
git checkout <head-branch>
git rebase origin/<default-branch>
```

Resolve any conflicts; skip the PR if resolution isn't straightforward. Don't push — Steps 2–5 stay local so the remote only ever sees a fully-validated branch.

**2. Verify the change.** Determine the real from/to versions and whether the package is a production or dev dependency — PR titles can be stale.

**3. Understand what's changing and apply any migrations.** Find release notes, a changelog, a migration guide, or whatever else the package's maintainers publish to describe this version bump — GitHub Releases, a CHANGELOG file, the project's docs site, a release blog post, etc. The goal is to know about breaking changes, deprecations, and migration steps. Apply any documented migrations even if nothing's currently failing — deprecations often don't break the build until a future removal, and doing the migration now is much cheaper than tracing a regression later. If it's a major version bump and nothing of that kind exists anywhere, treat that as a red flag and skip.

**4. Validate the change.** Install dependencies, then run every check the project uses to gate normal development — linting, formatting, type-checking, tests, builds, anything else that's wired up. The goal is to confirm this upgrade doesn't disturb any part of the standard development lifecycle.

If something fails because of the upgrade, the rule is **unambiguous fix → do it; ambiguous fix → stop**:

- **Do the work whenever the migration path is unambiguous, regardless of scale.** A documented hook rename across a hundred files, snapshot updates, codegen drift, removed APIs with a clear replacement, type-errors in tests that follow the migration guide cleanly — these are the job, not blockers. "The fix isn't a one-liner" or "this would touch a lot of files" is not a valid skip reason. Read the migration guide; apply it.
- **Stop only when the right fix is genuinely unclear.** Multiple plausible fixes that would lead to different user-facing behaviour, a breaking change with no migration guidance from the maintainer, or a fix that would force a project-rule violation (e.g., requires `any`/`as` and project rules forbid them with no clean alternative). When you stop, report exactly what's ambiguous so the human can decide.

**5. Sanity-test production dependencies at runtime.** Required for every production-dependency upgrade — no exceptions. Dev dependencies skip to Step 6 because Step 4 already covers them.

Exercise the affected functionality end-to-end with browser automation (Playwright MCP, browser-use-style skill, etc.). The code path that imports and runs the upgraded package must actually execute and produce the expected behaviour, with no related console errors. Loading a page that never reaches the new code, or hitting an endpoint that errors out before the upgraded code runs, does not count.

**If you can't run that code path locally — missing credentials, missing API key, broken local infra, upstream service down — STOP and report what's blocking.** Do NOT substitute any of these rationalisations:

- "the failure is environmental, not from the package"
- "CI's E2E shards are green"
- "it's only a patch-level bump"
- "static checks all pass"
- "the import succeeded, even though the call didn't run"

The whole point of Step 5 is to catch what static checks and CI can't catch from inside this orchestration. None of those substitutes discharge the requirement. The human either fixes the local environment so verification can happen, or takes the merge decision themselves.

**6. Push, watch CI, and squash-merge.**

```bash
git push --force origin <head-branch>
gh pr checks <number> --watch
gh pr merge <number> --squash
```

Force-push is safe — bot-owned branches. If the push is rejected because Dependabot rebased while you were working, skip; the next run will pick it up cleanly. If CI fails or the merge is blocked in a way that can't be resolved straightforwardly, stop and report what's blocking — leave the decision to the human.
