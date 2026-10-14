# Before/after screenshots

Images only. GitHub has no API for hosting video, and video served from a repo
comes back as `application/octet-stream` with `nosniff`, so it never plays.

## When — a narrow gate

Capture only when the diff changes **what a user sees rendered in a browser**:
component markup, styles, layout, user-facing copy, theming, icons.

Not for logic, API, build, config, test, docs, or agent-config changes. Most PRs
get no screenshots; that is the expected outcome, not a failure.

Skip silently — no question, no mention in the description, never block the PR —
when any of these holds:

- `gh repo view --json isPrivate` → `true`. Raw URLs 404 for anyone not logged
  in, so the images would render broken.
- No dev server you can start, or you can't map the change to a specific route.

## Before = the base code, served locally

The comparison is evidence only when the code is the one difference between the
two shots: the same data, sign-in, route, and viewport. So the before shot runs
the base code at the merge-base on your machine, not the production site, which
can sit behind a login, hold real user data, and drift from the merge-base.

Serve the base faithfully, with its own dependencies and config. When you are
done, leave everything as you found it: the branch's checkout unchanged, and no
checkout or server for the base left over. The cheap way is to check out the
merge-base under the dev server you started for the branch, and hot reload picks
it up; it is faithful only when hot reload picks up everything the diff changes.
If you cannot serve the base faithfully, skip silently.

Use seeded or test data, never real users' data: the images go into a public
repo and stay there.

A route that does not exist on the base is new. Show **After** alone, no
comparison.

## Capture

Start the app — prefer the `run` skill. Before on the base code, after on the
branch code, with the same route and **the same viewport**, or the comparison is
worthless. Save the shots outside the repo, because `playwright-cli` writes into
the current directory and a stray image ends up in the commit.

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
between the two for reasons unrelated to the change, such as a cookie banner. At
most 3 routes.

## Upload

`scripts/upload-pr-media.sh`, a sibling of the `references/` directory you read
this from:

```bash
<skill-dir>/scripts/upload-pr-media.sh <branch-name> <dir>/before.png <dir>/after.png
```

Prints one raw URL per file, in argument order. **Exit 3 = private repo** → drop
the media and raise the PR without it. Uploads land on an orphan `pr-assets`
branch, created on demand; it never merges into main and adds nothing to its
history.

## Embed

Put the comparison directly under the paragraph explaining WHY, before any
detail. It is evidence for the argument, not an appendix.

| Before | After |
|---|---|
| `<img src="…before.png" width="450">` | `<img src="…after.png" width="450">` |

Write those as real `<img>` tags, not code spans. Label each pair with its route
when there's more than one. Screenshots never replace the written WHY — a
reviewer who reads only the prose must still understand the change.
