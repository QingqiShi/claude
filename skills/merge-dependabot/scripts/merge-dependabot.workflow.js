export const meta = {
  name: 'merge-dependabot',
  description: 'Merge or park each open Dependabot PR, one at a time; release notes are fetched separately, before this workflow runs',
  phases: [
    { title: 'Merge', detail: 'one agent per PR, one at a time, because the work tree is shared' },
    { title: 'Hand over', detail: 'leave the work tree where the user needs it and delete the branches of merged PRs' },
  ],
}

const { prs, defaultBranch, packageManager, startBranch, skillDir, notesDir } = args

const notesPath = (pr) => `${notesDir}/notes-pr-${pr.number}.md`

const MERGE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['merged', 'parked', 'skipped'] },
    reason: { type: 'string' },
    detail: { type: 'string' },
  },
  required: ['status', 'reason', 'detail'],
}

const HANDOVER_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    head: { type: 'string' },
    pruned: { type: 'integer' },
  },
  required: ['ok', 'head', 'pruned'],
}

const mergeInstructions = (pr) => `You are a sub-agent in a larger orchestration, and you own Dependabot PR #${pr.number} (${pr.title}) on branch ${pr.headBranch} from end to end. The default branch is ${defaultBranch} and the package manager is ${packageManager}.

Get this bump merged with a reason to believe it works, or park it for the user with a clear account of what stopped you. Every call in between is yours, and nobody runs behind you to pick up what you leave.

## How much research the bump warrants

Read the diff first, with \`gh pr diff ${pr.number}\`. Take the versions from the lockfile or manifest change rather than from the title, which can be stale, and find where the manifest declares each package.

A patch or minor bump of a dev dependency or a GitHub Action carries its risk in the checks, so go straight to the work below. A major bump, or anything in \`dependencies\`, can change what the app does at runtime, so find out what the maintainers said before you touch it.

The release notes are already gathered for you at ${notesPath(pr)}, fetched deterministically before this workflow started. The file may be missing, and its coverage block marks what it does not hold: a package whose section covers only some of the versions in the range, or none of them, and a package this PR bumps that has no section at all. So the file is not the whole list of what the PR changes. Neither is a reason to stop: take the list of bumps from the diff, and gather the notes the file lacks yourself.

Read that file when the bump warrants it. When it is large, give a sub-agent on haiku the path and the question you need answered — which entries touch the APIs this repository calls — instead of pulling the whole file into your own context; a group bump's notes run to hundreds of kilobytes. Migration guides on docs sites are not in the file, so search the web for one when a major bump points at it.

## Get the branch onto ${defaultBranch}

    git fetch origin
    git checkout origin/${defaultBranch}
    git checkout -B ${pr.headBranch} origin/${pr.headBranch}
    git rev-parse origin/${pr.headBranch}
    git rebase origin/${defaultBranch}

Keep the SHA that \`git rev-parse\` prints. The push at the end names it to prove the branch has not moved on the remote.

A lockfile conflict is yours to resolve: take the ${defaultBranch} version of the lockfile, finish the rebase, and run a plain install to regenerate it against the new manifest. Do not comment \`@dependabot rebase\` and do not wait on the bot — it costs minutes and hands back the same conflict. Any other conflict is a park.

Push nothing before the merge step, so the remote only ever sees a branch you have validated.

## When a command fails

Three kinds of failure come up from here on, and they do not get the same answer.

The bump caused it: a formatter that reformats, an export that was renamed, a signature that changed, a snapshot that moved for a documented reason. Fix it, run the command again, and say so in your report.

Your own command caused it: a flag that does not exist, a path that is wrong, a server you never started. Correct the command and run it again. It tells you nothing about the dependency, so it is not a reason to park.

A route is closed to you: a credential you do not have, a permission denial, a service you cannot reach. That closes the route, not the task, so look for another way to reach the same signal and take it. Do not retry the denied action and do not work around the denial, because a denial is the user's decision about what you may do. Park only when every route to the signal is closed, and name in your report each route you tried and what closed it. A denial on a side check that the merge does not rest on is not a reason to park at all.

## Install and check

Install with ${packageManager}, plainly. No frozen or immutable lockfile flag: the rebase above is expected to move the lockfile, and a frozen install fails on exactly the state you just made.

Then run every check the project gates development with — lint, format, type-check, tests, build, and whatever else is wired up.

A project check that stays red for a reason you cannot attribute to the bump is a park, because an unexplained red check is the shape a regression arrives in.

## Prove it works

Nothing merges without a signal of confidence. Which signal that is, is your call, and it follows what this dependency can break. Anything the user sees gets driven in a browser, on the page or flow that runs the upgraded code, with the console watched. A logic utility, a build tool or an Action is covered by the checks you have already run. Name the signal you chose in your report.

Before you choose, list ${skillDir}/references/verification/. Each file there is named for the dependency it covers, so read the one that matches this package, or the one for a sibling package that does the same job — an icon set is covered by the guide written for another icon set. When nothing matches, read none of them and the principle above decides, and the same holds when the guide's own line on when it stops applying is true of this bump.

A guide aims a proportionate check at what the release changed: a release that only adds icons does not need every icon audited, and a handful of classification fixes does not need a differential over every input. What a guide never gives you is a reason to skip verification.

Green checks do not stand in for a runtime signal when the dependency renders something.

## Merge

    git push --force-with-lease=${pr.headBranch}:<the SHA you kept> origin ${pr.headBranch}
    gh pr checks ${pr.number} --watch
    gh pr merge ${pr.number} --squash --match-head-commit "$(git rev-parse HEAD)"

Force-push is safe on a bot-owned branch, and naming the SHA you started from keeps the lease honest: git refuses the push if Dependabot rebased the branch while you worked, which a bare \`--force-with-lease\` would miss once a later \`git fetch\` had moved your remote-tracking ref. \`--match-head-commit\` makes GitHub refuse the merge if the branch moved under you, and it checks that atomically, so nothing before it needs to test the head.

Either refusal means the branch moved: usually Dependabot rebased it onto a newer ${defaultBranch}, which it does after every merge there, the PR before yours included; sometimes it recut a group bump onto newer versions. Either way the PR still wants merging, so pick up the new head rather than leave it for a later run. The exception is a PR that is no longer open: a newer release supersedes a single-package PR, and Dependabot closes it and opens a fresh one on another branch, so check the state first and skip a closed PR, whether it was the push or the merge that failed.

To restart, \`git reset --hard\` what you hold locally and start again from "Get the branch onto ${defaultBranch}" above, keeping the new SHA this time. Your lockfile resolution belonged to the old head, so discarding it loses nothing.

How much you repeat follows what actually moved. The two heads sit on different bases, so a plain diff between them carries everything ${defaultBranch} gained in between, and it is the manifest and lockfile hunks that answer. Same versions on a newer base: your research stands, and you re-run the checks and the verification against the new tree. Different versions: it is a different bump, so read the diff and research it as the section above says, because the notes file was fetched for the old range and no longer covers it.

Take that restart once. If the branch moves under you a second time, skip the PR and report that it kept moving — the bot is recutting faster than you can validate, and the rest of the queue is waiting on this checkout.

## Park

Park whenever you cannot get to a confident merge — not when you hit a failure you can still correct, and not while another route to the signal is still open. It is a normal outcome and it costs the user one look, where a merge on a guess costs a regression. Commit your work in progress on ${pr.headBranch}, locally and unpushed, so the next PR starts from a clean tree and nothing you did is lost. The user may read your report standing in that branch, so write it as the account of where you got to.

## The work tree is shared

The PRs before and after yours use the same checkout. Write scratch output, such as browser snapshots, outside the repository, and shut down any dev server you started before you finish. A skip leaves nothing worth keeping, so \`git reset --hard\` before you report and the next PR starts from a clean tree.

## Output

State only what you checked, and label anything you assumed or inferred as not verified, because the user acts on this report without rerunning your session.

- status: merged, parked, or skipped.
- reason: one sentence. It appears in the final report next to the PR.
- detail: what you researched and what it said, what you fixed, and the signal that convinced you. For a park, the user reads this straight under the summary, so say what stopped you, each route you tried and what closed it, and what it takes to finish, with the command to run when there is one.`

const handoverInstructions = (target) => `You are a sub-agent with one mechanical task in the repository. Change nothing else, and commit nothing.
${target ? `\nRun \`git checkout ${target}\` first, and note whether it exited zero.\n` : ''}
Run \`bash ${skillDir}/scripts/prune-merged-branches.sh\`. It deletes the local \`dependabot/*\` branches whose remote branch is gone, and prints \`deleted: <count>\` as its last line.

Report ok — whether the checkout exited zero, or true when there was no checkout to run — head, what \`git rev-parse --abbrev-ref HEAD\` prints afterwards, and pruned, the count the script printed, or 0 if it did not reach that line.`

const mergeOne = (pr) =>
  agent(mergeInstructions(pr), {
    label: `merge:#${pr.number}`,
    phase: 'Merge',
    schema: MERGE_SCHEMA,
    agentType: 'general-purpose',
  })

const handover = (target) =>
  agent(handoverInstructions(target), {
    label: target ? `hand over:${target}` : 'hand over',
    phase: 'Hand over',
    schema: HANDOVER_SCHEMA,
    model: 'haiku',
    agentType: 'general-purpose',
  })

phase('Merge')
const rows = []
for (let i = 0; i < prs.length; i++) {
  const pr = prs[i]
  const result = await mergeOne(pr)
  const status = result ? result.status : 'parked'
  const reason = result ? result.reason : 'the agent for this PR returned nothing.'
  const detail = result ? result.detail : ''
  const label = status === 'merged' ? 'Merged' : status === 'skipped' ? 'Skipped' : 'Parked'

  rows.push({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    headBranch: pr.headBranch,
    status,
    reason,
    detail,
    returned: Boolean(result),
    cell: status === 'skipped' ? `Skipped — ${reason}` : label,
  })
  log(status === 'merged' ? `#${pr.number}: Merged` : `#${pr.number}: ${label} — ${reason}`)
}

const parked = rows.filter((r) => r.status === 'parked')

phase('Hand over')
let target = null
if (parked.length === 1) {
  target = parked[0].headBranch
  log(`parked #${parked[0].number}: checking out ${target}`)
} else if (parked.length > 1) {
  target = `origin/${defaultBranch}`
  log(`${parked.length} PRs parked: leaving the work tree at ${target}`)
}
const handedOver = await handover(target)
const checkedOut = Boolean(handedOver && handedOver.ok)
const standingIn = parked.length === 1 && checkedOut ? parked[0] : null
const pruned = handedOver ? handedOver.pruned : 0

const lines = ['## Dependabot PR Summary', '']
const blank = () => {
  if (lines[lines.length - 1] !== '') lines.push('')
}
const quoted = (detail, indent) =>
  detail
    .split('\n')
    .map((line) => `${indent}${`> ${line}`.trimEnd()}`)
const UNKNOWN_STATE = 'The state of that branch is not known, so read `git status` and `git log` before you build on it.'

if (standingIn) {
  const left = standingIn.returned ? 'The work so far is committed on that branch and unpushed.' : UNKNOWN_STATE
  lines.push(
    `**You are standing in \`${standingIn.headBranch}\`**, parked at [#${standingIn.number}](${standingIn.url}) — ${standingIn.reason} ${left}`,
    '',
  )
  if (standingIn.detail) lines.push(...quoted(standingIn.detail, ''), '')
} else if (parked.length === 1) {
  const why = handedOver ? 'The checkout failed' : 'The handover step reported nothing'
  const left = parked[0].returned ? '' : ` ${UNKNOWN_STATE}`
  lines.push(
    `**Parked:** [#${parked[0].number}](${parked[0].url}) — ${parked[0].reason} ${why}, so continue with \`git checkout ${parked[0].headBranch}\`.${left}`,
    '',
  )
  if (parked[0].detail) lines.push(...quoted(parked[0].detail, ''), '')
} else if (parked.length > 1) {
  const startedOn = startBranch ? `, not on \`${startBranch}\` where the session started` : ''
  const where = !handedOver
    ? 'the handover step reported nothing, so where the work tree is standing is not known'
    : checkedOut
      ? `the work tree is on a detached HEAD at \`origin/${defaultBranch}\`${startedOn}`
      : `the checkout to \`origin/${defaultBranch}\` failed, so the work tree is where the last PR left it`
  lines.push(`**Parked — ${where}. Check one out to continue:**`, '')
  for (const r of parked) {
    lines.push(`- [#${r.number}](${r.url}) — ${r.reason} \`git checkout ${r.headBranch}\`${r.returned ? '' : ` ${UNKNOWN_STATE}`}`)
    if (r.detail) lines.push('', ...quoted(r.detail, '  '), '')
  }
  blank()
}

lines.push('| PR | Title | Status |', '|----|-------|--------|')
for (const r of rows) lines.push(`| [#${r.number}](${r.url}) | ${r.title.replace(/\|/g, '\\|')} | ${r.cell} |`)

if (pruned > 0) {
  lines.push('', `Deleted ${pruned} local \`dependabot/*\` branch${pruned === 1 ? '' : 'es'} whose upstream is gone.`)
}

return { rows, parked: parked.map((r) => ({ number: r.number, headBranch: r.headBranch })), markdown: lines.join('\n') }
