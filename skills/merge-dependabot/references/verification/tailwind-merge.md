# Verifying a tailwind-merge bump

The same check fits other utilities that resolve conflicts between utility classes.

**Check.** A patch or minor release of one of these is a list of classification fixes, and each entry names the utility family it corrects. Take that list and grep the source for the exact utilities named, not for the family in general. A class the repo never writes cannot change what the merge returns. For a family the repo does write, open the page that renders it and compare it against the same page on the default branch — one or two targeted looks, chosen from the notes. When the grep matches nothing, one look is still due: open a page whose components pass their classes through the merge helper and confirm it renders as it does on the default branch, with a clean console. That shows the new version loads and merges at all, which no entry in the notes speaks to.

For a stronger signal without a browser walk, install the old and the new version side by side outside the repository, so the workspace does not resolve them back to the version under test, and load both bundles from one script over the class strings in the source. Before you trust a "no differences" result, run a pair from the release notes that the fix is meant to change and confirm your harness reports it; a comparison that never reached the new code path is worse than no comparison. Stop at the class strings the source actually contains. Expanding them into every ordered pair and every caller combination multiplies the run and adds no signal the notes point at.

**Why it is enough.** These releases change which class wins inside one named group. If the repo writes no class in a changed group, the merged output cannot move, and what renders is what already shipped.

**When it stops applying.** The repo passes a custom config or extends the merger with its own theme scales, because a fix that applies "only with a custom scale" then applies here. Also a major bump, or a release that changes the merge algorithm rather than one class group.
