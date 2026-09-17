# Verifying a postcss-preset-env bump

The same check fits autoprefixer, cssnano, other PostCSS plugins, and Sass or Less toolchains — anything whose only product is compiled CSS.

**Check.** Build twice and compare the emitted stylesheets byte for byte: once on the rebased branch, once on the default branch, copying the CSS out of the build directory after each run, because the second build overwrites the first's output. `shasum -a 256` over both sets is the comparison. Identical hashes across identically named chunks close the question.

Two steps carry the argument. Before each build, confirm which version is actually installed — read the resolved package's own `package.json` version, or the symlink under `node_modules` — because two builds of the same version are easy to produce by accident and they always agree. And confirm the build is cold: a framework build cache can serve the first run's CSS to the second and hand you a false match. Check the project's build-cache setting rather than assuming.

**Why it is enough.** No browser is needed, and say so in the report with the reason: the browser would load the same bytes the default branch already serves.

**When it stops applying.** The hashes differ. Read the diff then; a difference you can trace to a changelog entry and judge harmless can still merge, but name what moved. Also when the package emits more than CSS, when the bump regenerates class names rather than rewriting declarations, or when it is major.
