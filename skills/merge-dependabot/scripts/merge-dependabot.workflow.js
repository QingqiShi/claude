export const meta = {
  name: 'merge-dependabot',
  description: 'Scout every open Dependabot PR in parallel, write a brief for each, then execute the briefs one PR at a time',
  phases: [
    { title: 'Scout', detail: 'one read-only agent per PR' },
    { title: 'Decide', detail: 'one brief per PR, on the session model' },
    { title: 'Execute', detail: 'one PR at a time, because the work tree is shared' },
  ],
}

const { prs, defaultBranch, packageManager } = args
const MAX_EXECUTE_ROUNDS = 2

// Schemas: the output contract of each role.

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    packages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
        required: ['name', 'from', 'to'],
      },
    },
    dependencyType: { type: 'string', enum: ['production', 'dev', 'github-action', 'mixed'] },
    usedIn: { type: 'string' },
    releaseNotes: { type: 'string' },
    runtimeGates: { type: 'string' },
    unknowns: { type: 'string' },
  },
  required: ['packages', 'dependencyType', 'usedIn', 'releaseNotes', 'runtimeGates', 'unknowns'],
}

const DECIDE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['proceed', 'skip', 'needs_attention'] },
    reason: { type: 'string' },
    brief: { type: 'string' },
  },
  required: ['action', 'reason', 'brief'],
}

const EXECUTE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['merged', 'skipped', 'stopped'] },
    reason: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['status', 'reason', 'detail'],
}

// Instructions: the standing text of each role, with this PR's values filled in.

const preamble = (pr, task) =>
  `You are a sub-agent in a larger orchestration. Your only task is to ${task} Dependabot PR #${pr.number} (${pr.title}) on branch ${pr.headBranch}. The default branch is ${defaultBranch} and the package manager is ${packageManager}.`

const scoutInstructions = (pr) => `${preamble(pr, 'scout')}

You gather the facts the orchestrator needs to decide whether and how to merge this PR. You decide nothing, and you leave the work tree untouched: read the PR through gh, the release notes on the web, and the repository as it is checked out.

## What to find

Real versions and dependency type. Read the PR diff with "gh pr diff ${pr.number}". Take the from and to versions from the lockfile or manifest change, not the title, which can be stale. For each package, find where the manifest declares it: dependencies, devDependencies, or a workflow file for a GitHub Action. Dependabot's own labels get this wrong, so trust the manifest.

Release notes between the two versions. Look wherever the maintainers publish: GitHub Releases, a CHANGELOG file in the package or its repository, the docs site, a release blog post. Cover every release from the old version up to and including the new one.

How the repository uses the package. Search for imports and the APIs called. Note anything that gates the code path at runtime, such as an environment variable that has to be set or a service that has to be reachable, because the orchestrator uses that to plan a runtime check.

## Report

Quote a release-note entry when it mentions a breaking change, a deprecation, a behaviour change, or an API this repository calls; summarise the rest in a line. Write "none found" rather than leave a field empty.

- packages: one entry per package with name, from, to.
- dependencyType: production, dev, github-action, or mixed when the packages differ, per the manifest.
- usedIn: the files and the APIs called, or "not imported directly".
- releaseNotes: the links, then the quoted entries and the one-line summary.
- runtimeGates: what must be true locally for the code path to run.
- unknowns: what you looked for and could not find.`

const decideInstructions = (pr) => `${preamble(pr, 'decide how to handle')}

You hold the judgement for this PR. The scout report below gives the facts. The executor that follows does exactly what your brief says and stops on anything the brief does not cover, so settle in writing everything it would otherwise have to judge. You may read the repository to check a usage the scout described. You do not install, rebase, or run anything.

## Skip, proceed, or hand to the human

- Skip a major bump whose maintainers published nothing about it. Silence at that scale means the risk is unknown, not absent.
- Skip when the notes show a behaviour change and the repository's usage leaves the outcome unclear.
- Needs attention when the call is the human's: a fix with several plausible forms that differ in user-facing behaviour, a fix that needs a project-rule violation, or a runtime proof the local environment cannot deliver because the code path is gated on credentials or a service the scout found absent. Say exactly what the human has to decide or supply.
- Proceed otherwise, with a brief.

## The brief

Migrations. Name each documented migration to apply, deprecations included, even when nothing fails yet. A deprecation breaks the build at a later removal, and migrating now is cheaper than tracing that regression. Scale is not a reason to skip: a documented rename across a hundred files is a brief, not a blocker.

Runtime proof, for a production dependency. Name the page or flow that runs the upgraded code, and the evidence that shows it ran: a network request, a rendered result, a value on window. A page that never reaches the new code proves nothing. A dev dependency or a GitHub Action needs no runtime proof; the executor's checks cover it. Say so in the brief.

Expected fallout. List the check failures the migration will cause and how to fix each, so the executor can carry on instead of stopping.

## When the executor has stopped

Your prompt then also carries your previous brief and the executor's report. The executor stops at the first surprise and does not investigate, so expect small stops, and answer each with the specific instruction it lacked. Extend the brief when the right fix is clear, whatever its scale. Otherwise choose needs attention and say exactly what is unclear.

## Output

- action: proceed, skip, or needs_attention.
- reason: one sentence. It appears in the final report next to the PR.
- brief: for proceed, the full brief the executor follows. Empty otherwise.`

const executeInstructions = (pr) => `${preamble(pr, 'carry out the brief below for')}

The brief has settled what to migrate, what proves the upgrade at runtime, and which check failures to expect. Everything else is settled by stopping.

## Stop at the first surprise

Stopping is the normal outcome when anything is not in the brief, and it is cheap: your report goes to the decide agent, which has the judgement and the context to extend the brief or hand the PR to a human, and a fresh executor continues from the branch you leave behind. Working it out yourself is the expensive path. A fix you improvise lands in production without anyone having judged it, and an innocent-looking changelog is exactly where a regression hides.

So stop the first time something the brief did not list happens: a check fails, a migration does not apply the way the notes describe, an install, a server, or a test run does not finish, the runtime evidence does not appear, an element you need is not on the page. Running the same command a second time to confirm what you saw is fine. Changing what you run, editing a test, a snapshot, a type, or a config to make a check pass, or looking for another way to reach the evidence, is not. Report what you ran, what you saw, and which step you were on.

The one thing you may fix unasked is formatter output, because it carries no meaning. A changed snapshot or generated file is information about behaviour and belongs in the report.

## The work tree is shared

The PRs before and after yours use the same checkout. Write scratch output, such as browser snapshots, outside the repository. When you finish or stop, shut down any dev server you started. When you stop with work in progress, commit it on the head branch locally and unpushed, so nothing is lost and the next PR starts from a clean tree.

## Steps

1. Rebase locally.

    git fetch origin
    git checkout origin/${defaultBranch}
    git checkout -B ${pr.headBranch} origin/${pr.headBranch}
    git rebase origin/${defaultBranch}

A conflict in a generated file, such as the lockfile, resolves by taking the default branch's version and running the install again. Any other conflict: stop and report the files. Do not push until step 5, so the remote only ever sees a validated branch.

2. Apply the brief's migrations. Only those. If the notes mention something the brief does not, report it at the end rather than act on it.

3. Install with ${packageManager} and run every check the project uses to gate development: lint, format, type-check, tests, build, and whatever else is wired up. Fix the fallout the brief lists, and formatter output. Any other failure: stop and report the output.

4. Runtime proof, when the brief names one. Start the app, drive the named flow with browser automation, and capture the evidence the brief describes together with the console. If the evidence is absent or a related console error appears, stop and report what you saw. Passing checks and green CI do not stand in for the evidence; the brief named it because they cannot show it.

5. Push, watch CI, squash-merge.

    git push --force origin ${pr.headBranch}
    gh pr checks ${pr.number} --watch
    gh pr merge ${pr.number} --squash

Force-push is safe on a bot-owned branch. If the push is rejected because Dependabot rebased while you worked, skip the PR; the next run picks it up cleanly. If CI fails or the merge is blocked, stop and report.

## Output

- status: merged, skipped, or stopped.
- reason: one sentence. It appears in the final report next to the PR.
- detail: for stopped, the step you were on, the command you ran, and its exact output or the missing evidence. For any status, anything from the release notes that the brief did not cover.`

// Agents.

const scout = (pr) =>
  agent(scoutInstructions(pr), {
    label: `scout:#${pr.number}`,
    phase: 'Scout',
    schema: SCOUT_SCHEMA,
    model: 'sonnet',
    agentType: 'general-purpose',
  })

const decide = (pr, report, previous) =>
  agent(
    [
      decideInstructions(pr),
      `## Scout report\n\n${JSON.stringify(report, null, 2)}`,
      previous
        ? `## The executor stopped on your previous brief\n\nPrevious brief:\n${previous.brief}\n\nExecutor report:\n${previous.report}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    { label: `decide:#${pr.number}`, phase: 'Decide', schema: DECIDE_SCHEMA, agentType: 'general-purpose' },
  )

const execute = (pr, brief) =>
  agent(`${executeInstructions(pr)}\n\n## Brief\n\n${brief}`, {
    label: `execute:#${pr.number}`,
    phase: 'Execute',
    schema: EXECUTE_SCHEMA,
    model: 'sonnet',
    agentType: 'general-purpose',
  })

const attention = (reason) => ({ action: 'needs_attention', reason, brief: '' })

// Run.

const decided = await pipeline(
  prs,
  (pr) => scout(pr),
  (report, pr) =>
    report
      ? decide(pr, report).then((decision) => ({ report, decision: decision || attention('the decide agent returned nothing') }))
      : { report: null, decision: attention('the scout agent returned nothing') },
)

const rows = []
for (let i = 0; i < prs.length; i++) {
  const pr = prs[i]
  const item = decided[i] || { report: null, decision: attention('the scout or decide agent failed') }
  let decision = item.decision
  let status = null
  let rounds = 0

  while (decision.action === 'proceed' && rounds < MAX_EXECUTE_ROUNDS) {
    rounds++
    log(`#${pr.number}: executing, round ${rounds}`)
    const result = await execute(pr, decision.brief)
    if (!result) {
      decision = attention('the executor agent returned nothing')
      break
    }
    if (result.status === 'merged') {
      status = 'Merged'
      break
    }
    if (result.status === 'skipped') {
      status = `Skipped — ${result.reason}`
      break
    }
    if (rounds >= MAX_EXECUTE_ROUNDS) {
      decision = attention(result.reason)
      break
    }
    log(`#${pr.number}: executor stopped, deciding again`)
    decision =
      (await decide(pr, item.report, { brief: decision.brief, report: `${result.reason}\n\n${result.detail}` })) ||
      attention(result.reason)
  }

  if (!status) {
    status = decision.action === 'skip' ? `Skipped — ${decision.reason}` : `Needs attention — ${decision.reason}`
  }
  rows.push({ number: pr.number, title: pr.title, url: pr.url, status })
  log(`#${pr.number}: ${status}`)
}

const needsAttention = rows.filter((r) => r.status.startsWith('Needs attention'))
const lines = ['## Dependabot PR Summary', '']
if (needsAttention.length) {
  lines.push('**Needs attention:**')
  for (const r of needsAttention) lines.push(`- [#${r.number}](${r.url}) — ${r.status.replace('Needs attention — ', '')}`)
  lines.push('')
}
lines.push('| PR | Title | Status |', '|----|-------|--------|')
for (const r of rows) lines.push(`| [#${r.number}](${r.url}) | ${r.title.replace(/\|/g, '\\|')} | ${r.status} |`)

return { rows, markdown: lines.join('\n') }
