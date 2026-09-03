---
name: pr-standards
description: My standards for a pull request: the title and branch convention, what the description must say and must not, and how to attach before/after screenshots. Use whenever you write or edit a PR title, branch, or description, or push more work to an open PR.
---

# Pull request standards

## Title and branch

Conventional Commits, lowercase: the commit, the PR title, and the branch (`<type>/<kebab-desc>`) all carry the same type. Recheck the type whenever the WHY changes, because the WHY decides what the change is. In a worktree, rename the branch the harness created instead of branching off it.

## The WHY comes from the person, not the diff

Lead the description with why the change was made, as the conversation told you. The diff is ground truth for what changed and can confirm a reason, but it cannot supply one: a plausible motive read off the code is a guess, and a guessed WHY is the one error a reviewer cannot detect. Where no reason was given, write "motivation not recorded" at that point, open the PR as a draft, and report the gap so the person can fill it.

## Description

Write so the reviewer takes in the change at a glance and then finds what they need to approve it. Describe the change as the people affected by it experience it, not as the code that implements it. Pick whatever structure explains this change best; there is no template and no test plan.

Keep each paragraph on one line, because GitHub turns a line break inside a paragraph into a hard break. When the change closes an issue, `Closes #<n>` is the last line.

Use a visual where it shows a shape faster than prose can: a shallow file tree for a layout change, a call tree for control flow, a component tree for UI structure, pseudocode for an algorithm, a Mermaid diagram for a flow between parts. Show a change as a diff against the existing shape, so the reviewer sees what moved without re-reading the whole, keep only the nodes that make the point, and place the visual next to the sentence it supports.

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

## Screenshots

For a change to what a user sees rendered in a browser, show a before/after comparison directly under the WHY, so it reads as evidence rather than an appendix. `references/pr-media.md` has the gate (public repo, production URL), the capture and upload steps, and the embed format. When you edit a description, keep the `<img>` tags already in it: the URLs stay live and re-uploading is waste.
