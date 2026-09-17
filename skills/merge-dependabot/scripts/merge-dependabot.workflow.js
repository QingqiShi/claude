export const meta = {
  name: 'merge-dependabot',
  description: 'Merge or park each open Dependabot PR, one at a time; release notes are fetched separately, before this workflow runs',
  phases: [
    { title: 'Merge', detail: 'one agent per PR, one at a time, because the work tree is shared' },
    { title: 'Hand over', detail: 'leave the work tree where the user needs it' },
  ],
}

const { prs, defaultBranch, packageManager } = args

const NOTES_DIR = '/tmp/merge-dependabot'
const notesPath = (pr) => `${NOTES_DIR}/notes-pr-${pr.number}.md`

const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['merged', 'parked', 'skipped'] },
    reason: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['status', 'reason', 'detail'],
}

const CHECKOUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    head: { type: 'string' },
  },
  required: ['ok', 'head'],
}

const mergeInstructions = (pr) => `You are a sub-agent in a larger orchestration, and you own Dependabot PR #${pr.number} (${pr.title}) on branch ${pr.headBranch} from end to end. The default branch is ${defaultBranch} and the package manager is ${packageManager}.

Get this bump merged with a reason to believe it works, or park it for the user with a clear account of what stopped you. Every call in between is yours, and nobody runs behind you to pick up what you leave.

## How much research the bump warrants

Read the diff first, with \`gh pr diff ${pr.number}\`. Take the versions from the lockfile or manifest change rather than from the title, which can be stale, and find where the manifest declares each package.

A patch or minor bump of a dev dependency or a GitHub Action carries its risk in the checks, so go straight to the work below. A major bump, or anything in \`dependencies\`, can change what the app does at runtime, so find out what the maintainers said before you touch it.

The release notes are already gathered for you at ${notesPath(pr)}, fetched deterministically before this workflow started. The file may be missing, or its coverage line may say no notes were found for a package — both are normal and not a reason to stop; gather what you need yourself when that happens.

Read that file when the bump warrants it. When it is large, give a sub-agent on haiku the path and the question you need answered — which entries touch the APIs this repository calls — instead of pulling the whole file into your own context; a group bump's notes run to hundreds of kilobytes. Migration guides on docs sites are not in the file, so search the web for one when a major bump points at it.

## Get the branch onto ${defaultBranch}

    git fetch origin
    git checkout origin/${defaultBranch}
    git checkout -B ${pr.headBranch} origin/${pr.headBranch}
    git rebase origin/${defaultBranch}

A lockfile conflict is yours to resolve: take the ${defaultBranch} version of the lockfile, finish the rebase, and run a plain install to regenerate it against the new manifest. Do not comment \`@dependabot rebase\` and do not wait on the bot — it costs minutes and hands back the same conflict. Any other conflict is a park.

Push nothing before the merge step, so the remote only ever sees a branch you have validated.

## Install and check

Install with ${packageManager}, plainly. No frozen or immutable lockfile flag: the rebase above is expected to move the lockfile, and a frozen install fails on exactly the state you just made.

Then run every check the project gates development with — lint, format, type-check, tests, build, and whatever else is wired up.

A failure you can attribute to the bump is yours to fix: formatter output, a renamed export, a changed signature, a snapshot that moved for a documented reason. Fix it, re-run the check, and say so in your report. A failure you cannot attribute to the bump is a park, because an unexplained red check is the shape a regression arrives in.

## Prove it works

Nothing merges without a signal of confidence. Which signal that is, is your call, and it follows what this dependency can break. Anything the user sees gets driven in a browser, on the page or flow that runs the upgraded code, with the console watched. A logic utility, a build tool or an Action is covered by the checks you have already run. Name the signal you chose in your report.

Green checks do not stand in for a runtime signal when the dependency renders something.

## Merge

    git push --force origin ${pr.headBranch}
    gh pr checks ${pr.number} --watch
    gh pr merge ${pr.number} --squash --match-head-commit "$(git rev-parse HEAD)"

Force-push is safe on a bot-owned branch. \`--match-head-commit\` makes GitHub refuse the merge if the branch moved under you, and it checks that atomically, so nothing before it needs to test the head. If the push is rejected because Dependabot rebased while you worked, skip the PR; the next run picks it up cleanly.

## Park

Park whenever you cannot get to a confident merge. It is a normal outcome and it costs the user one look, where a merge on a guess costs a regression. Commit your work in progress on ${pr.headBranch}, locally and unpushed, so the next PR starts from a clean tree and nothing you did is lost. The user may read your report standing in that branch, so write it as the account of where you got to.

## The work tree is shared

The PRs before and after yours use the same checkout. Write scratch output, such as browser snapshots, outside the repository, and shut down any dev server you started before you finish.

## Output

- status: merged, parked, or skipped.
- reason: one sentence. It appears in the final report next to the PR.
- detail: what you researched and what it said, what you fixed, and the signal that convinced you. For a park, what stopped you and what it would take to finish.`

const checkoutInstructions = (target) => `You are a sub-agent with one mechanical task: run \`git checkout ${target}\` in the repository, then report whether it exited zero and what \`git rev-parse --abbrev-ref HEAD\` prints afterwards. Change nothing else, and commit nothing.`

const mergeOne = (pr) =>
  agent(mergeInstructions(pr), {
    label: `merge:#${pr.number}`,
    phase: 'Merge',
    schema: MERGE_SCHEMA,
    agentType: 'general-purpose',
  })

const checkout = (target) =>
  agent(checkoutInstructions(target), {
    label: `checkout:${target}`,
    phase: 'Hand over',
    schema: CHECKOUT_SCHEMA,
    model: 'haiku',
    agentType: 'general-purpose',
  })

phase('Merge')
const rows = []
for (let i = 0; i < prs.length; i++) {
  const pr = prs[i]
  const result = await mergeOne(pr)
  const status = !result
    ? 'Parked — the agent for this PR returned nothing'
    : result.status === 'merged'
      ? 'Merged'
      : result.status === 'skipped'
        ? `Skipped — ${result.reason}`
        : `Parked — ${result.reason}`

  rows.push({ number: pr.number, title: pr.title, url: pr.url, headBranch: pr.headBranch, status })
  log(`#${pr.number}: ${status}`)
}

const parked = rows.filter((r) => r.status.startsWith('Parked'))
const reasonOf = (r) => r.status.replace(/^(Parked|Skipped) — /, '')

let standingIn = null
if (parked.length === 1) {
  phase('Hand over')
  log(`parked #${parked[0].number}: checking out ${parked[0].headBranch}`)
  const done = await checkout(parked[0].headBranch)
  if (done && done.ok) standingIn = parked[0]
} else if (parked.length > 1) {
  phase('Hand over')
  log(`${parked.length} PRs parked: leaving the work tree on ${defaultBranch}`)
  await checkout(`origin/${defaultBranch}`)
}

const lines = ['## Dependabot PR Summary', '']
if (standingIn) {
  lines.push(
    `**You are standing in \`${standingIn.headBranch}\`**, parked at [#${standingIn.number}](${standingIn.url}) — ${reasonOf(standingIn)} The work so far is committed on that branch and unpushed.`,
    '',
  )
} else if (parked.length === 1) {
  lines.push(
    `**Parked:** [#${parked[0].number}](${parked[0].url}) — ${reasonOf(parked[0])} The checkout failed, so continue with \`git checkout ${parked[0].headBranch}\`.`,
    '',
  )
} else if (parked.length > 1) {
  lines.push('**Parked — the work tree is back on the default branch. Check one out to continue:**')
  for (const r of parked) lines.push(`- [#${r.number}](${r.url}) — ${reasonOf(r)} \`git checkout ${r.headBranch}\``)
  lines.push('')
}
lines.push('| PR | Title | Status |', '|----|-------|--------|')
for (const r of rows) lines.push(`| [#${r.number}](${r.url}) | ${r.title.replace(/\|/g, '\\|')} | ${r.status} |`)

return { rows, parked: parked.map((r) => ({ number: r.number, headBranch: r.headBranch })), markdown: lines.join('\n') }
