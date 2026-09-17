# Verifying a lucide-react bump

The same check fits react-icons, the heroicons and phosphor packages, and anything else that exports one component per icon.

**Check.** Confirm from the release notes that the release only adds icons — no renames, no removals, no change to the component props or the SVG attributes. Then start the app, open one page that renders icons, and take one screenshot to confirm they draw. A single DOM query over that page adds more than a second screenshot: collect the icon `<svg>` elements and count the ones with no child elements, and the ones that are visible with zero width. A broken icon export renders as an empty `<svg>`, not as a crash, so it passes every check and the screenshot alone can miss it in a dense view.

**Why it is enough.** An additive release does not touch the icons the repo already imports, and the type check and the build already prove every imported name still resolves — a removed or renamed export fails to compile. The browser only has to show that the rendering path still produces drawn paths, and one page shows that for all of them.

**When it stops applying.** The release renames or removes icons, changes props, stroke or default size, or is a major bump: then walk the views that use the affected icons. Also when the repo picks icon names dynamically from data rather than by static import, because no compile step checks those names; grep for a lookup into the icon module before you rely on the build.
