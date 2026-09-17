# Verifying an ESLint plugin bump

The same check fits shareable ESLint configs, typescript-eslint, stylelint plugins, and similar analysis-only packages.

**Check.** The full lint run proves the new version does not flag the existing codebase. It does not prove the rules still fire: a rule that silently stopped reporting passes just as quietly. Add a probe. Pipe a snippet that violates the rules this repo enables through the linter on stdin, and a clean snippet that must not be flagged, and read which rule ids come back.

Pass an existing tracked file's path as the stdin filename. A made-up path fails to parse under a type-aware config, with an error about the project service rather than about your snippet, and tells you nothing. Take the rule names from the repo's lint config, and shape the violations around the changelog entry when it names the rules it touched. Nothing is written into the repository, so there is nothing to clean up.

**Why it is enough.** The package has no runtime or rendered surface. The only thing it can break is which code it reports, and the probe has now shown both directions: clean code passes, violating code is caught.

**When it stops applying.** A formatter whose output the repo commits, where the repo-wide format check is the equivalent signal. A bump that changes an autofix, where you also read what the fix writes on a sample. Or a major bump, which can move the config format itself.
