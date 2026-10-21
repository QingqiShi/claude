# Before/after media

Screenshots and screen recordings, attached with `gh --attach` (gh 2.99+). It
uploads to GitHub's own attachment storage, the same as a file dragged into the
PR box, so images render inline and a video plays in GitHub's player.

## When — a narrow gate

Capture only when the diff changes **what a user sees rendered in a browser**:
component markup, styles, layout, user-facing copy, theming, icons, motion.

Not for logic, API, build, config, test, docs, or agent-config changes. Most PRs
get no media; that is the expected outcome, not a failure.

Skip silently — no question, no mention in the description, never block the PR —
when there is no dev server you can start, or you can't map the change to a
specific route.

## Screenshot or recording

Record when what changed only shows over time: a user flow across steps or
screens, an animation, a transition, a hover or press response, a loading or
optimistic state. A reviewer cannot judge an easing curve or a flow's order from
stills. Take screenshots when the change is a static look — layout, colour,
copy, an icon — because stills sit side by side and compare at a glance. One PR
can mix both.

## Before = the base code, served locally

The comparison is evidence only when the code is the one difference between the
two captures: the same data, sign-in, route, viewport, and for a recording the
same script. So the before capture runs the base code at the merge-base on your
machine, not the production site, which can sit behind a login, hold real user
data, and drift from the merge-base.

Serve the base faithfully, with its own dependencies and config. When you are
done, leave everything as you found it: the branch's checkout unchanged, and no
checkout or server for the base left over. The cheap way is to check out the
merge-base under the dev server you started for the branch, and hot reload picks
it up; it is faithful only when hot reload picks up everything the diff changes.
If you cannot serve the base faithfully, skip silently.

Use seeded or test data, never real users' data: an attachment URL works for
anyone who has it.

A route or flow that does not exist on the base is new. Show **After** alone, no
comparison.

## Capture

Start the app — prefer the `run` skill. Before on the base code, after on the
branch code, with the same route and **the same viewport**, or the comparison is
worthless. Save the files outside the repo, because `playwright-cli` writes into
the current directory and a stray file ends up in the commit. At most 3 routes
or flows.

### Screenshots

```bash
playwright-cli -s=pr open --browser=chrome
playwright-cli -s=pr resize 1280 800
playwright-cli -s=pr goto "<base-url><route>"
playwright-cli -s=pr screenshot --filename=<dir>/before.png
playwright-cli -s=pr goto "<branch-url><route>"
playwright-cli -s=pr screenshot --filename=<dir>/after.png
playwright-cli -s=pr close
```

Let the page settle before each shot, and dismiss anything that would differ
between the two for reasons unrelated to the change, such as a cookie banner.

### Recordings

Walk the flow once with `playwright-cli` to find the locators, then write it as
one `run-code` script that records with `page.screencast` — the `playwright-cli`
skill's `references/video-recording.md` has the API. A script paces the actions
so a reviewer can follow them and replays identically on base and branch; driving
the CLI by hand records your pauses between commands.

Take the base URL as the only thing that differs between the two runs. Keep the
clip to the change: start just before it, end once it settles, a few seconds,
never past about 15. Pause long enough after each action for its animation to
finish and be seen. Chapter cards and overlays help a long flow, but put the same
ones in both runs, and leave them out of a clip about an animation, where they
cover what the reviewer came to see. The WebM it writes attaches as is.

## Attach and embed

Write the body with Markdown references to the local files where the media
belongs, then pass each file to `--attach`. gh uploads them and rewrites each
reference in place to its uploaded URL:

```bash
gh pr create --title "<title>" --body-file <dir>/body.md \
  --attach <dir>/before.png --attach <dir>/after.png
```

The same flag works on `gh pr edit`. Paths in a `--body-file` resolve from that
file's directory, so keep the body next to the media. A file that the body does
not reference is appended to the end, so reference every one.

When some uploads fail, gh still creates the PR, prints its URL, and exits
non-zero. Do not create it again: fix the failed file — for a size limit, a
shorter clip or a smaller viewport — and attach it with `gh pr edit`.

Put the comparison directly under the paragraph explaining WHY, before any
detail. It is evidence for the argument, not an appendix. Screenshots go side by
side:

| Before | After |
|---|---|
| `![Before](./before.png)` | `![After](./after.png)` |

A video plays only when its reference is alone in its paragraph; inside a table
or a sentence it becomes a plain link. The player shows the file name as its
caption, so name each file for what it shows. Stack recordings, each under its
own bold label:

```markdown
**Before**

![](./before.webm)

**After**

![](./after.webm)
```

Write those as real Markdown, not code spans. Label each comparison with its
route or flow when there's more than one. Media never replaces the written WHY —
a reviewer who reads only the prose must still understand the change.
