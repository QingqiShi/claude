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
- No production URL, no dev server you can start, or you can't map the change to
  a specific route.

## Before = production

The deployed app *is* the base state — never build the base locally to get it.
Find its URL in order: project CLAUDE.md → `gh repo view --json homepageUrl` →
`.vercel/project.json` (then the `vercel-cli` skill) → `package.json` `homepage`.

Production may sit slightly ahead of your merge-base if other PRs landed since
you branched. That's usually fine — but if the route you're shooting is one they
touched, the diff you show isn't yours. Skip rather than mislead.

A route that 404s in production is new. Show **After** alone, no comparison.

## After = local dev server

Start the app — prefer the `run` skill. Same route, and **the same viewport as
the before shot**, or the comparison is worthless.

## Capture

```bash
playwright-cli -s=pr open --browser=chrome
playwright-cli -s=pr resize 1280 800
playwright-cli -s=pr goto "<prod-url><route>"
playwright-cli -s=pr screenshot --filename=before.png
playwright-cli -s=pr goto "http://localhost:<port><route>"
playwright-cli -s=pr screenshot --filename=after.png
playwright-cli -s=pr close
```

Let the page settle before each shot, and dismiss anything that would differ
between the two for reasons unrelated to the change — cookie banners, a logged-out
state on prod against a logged-in dev session. At most 3 routes.

## Upload

`scripts/upload-pr-media.sh`, a sibling of the `references/` directory you read
this from:

```bash
<skill-dir>/scripts/upload-pr-media.sh <branch-name> before.png after.png
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
