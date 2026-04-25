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

**4. Validate the change.** Install dependencies, then run every check the project uses to gate normal development — linting, formatting, type-checking, tests, builds, anything else that's wired up. The goal is to confirm this upgrade doesn't disturb any part of the standard development lifecycle. If something fails because of the upgrade, attempt a straightforward fix or migration; skip if it's not clear.

**5. Sanity-test production dependencies at runtime.** Runtime verification is required for production-dependency upgrades; dev dependencies don't need it because Step 4 already covers them, so move straight to Step 6 in that case. For production dependencies, exercise the affected functionality end-to-end with whatever browser automation is available (Playwright MCP, browser-use-style skill, etc.). Loading a page isn't enough — the code path that imports and runs the upgraded package must actually execute, with no console errors and the expected behaviour. If you can't reasonably exercise it (no runnable UI, missing credentials, etc.), skip the PR — without runtime verification we can't merge a production-dependency upgrade with confidence.

**6. Push, watch CI, and squash-merge.**

```bash
git push --force origin <head-branch>
gh pr checks <number> --watch
gh pr merge <number> --squash
```

Force-push is safe — bot-owned branches. If the push is rejected because Dependabot rebased while you were working, skip; the next run will pick it up cleanly. If CI fails or the merge is blocked in a way that can't be resolved straightforwardly, stop and report what's blocking — leave the decision to the human.
