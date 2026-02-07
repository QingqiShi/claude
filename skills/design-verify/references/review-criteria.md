# Visual Review Criteria

Reference file for design-verify sub-agents. Read this before reviewing screenshots.

## How to Use This File

**Your role is qualitative visual review.** The `audit.js` script already runs programmatic checks for overflow, WCAG contrast ratios, interactive state CSS rules, token propagation, and hardcoded colors. Do not re-report those — they appear in the AUDIT RESULTS section of your output.

Your job is to catch what code analysis cannot: visual inconsistencies, layout problems, missing visual affordances, theme rendering issues, and anything that "looks wrong" in the screenshots. Focus on what you can see, not what you can measure.

**Skip criteria that are not applicable** to the page under review. If there are no images, skip image checks. If there is no navigation, skip navigation checks. Do not report inapplicable items.

## Severity Definitions

Apply these consistently across all findings:

- **Critical**: Blocks usability or comprehension. Examples: invisible text, broken layout making content unreachable, navigation completely missing, content entirely hidden or obscured, overlapping elements that block interaction.
- **Moderate**: Degrades experience but content remains usable. Examples: poor visual hierarchy, awkward spacing that hinders scanning, layout misalignment, elements that look broken but still function, unclear interactive affordance.
- **Minor**: Cosmetic polish issues. Examples: slightly uneven margins, subtle font-weight mismatch, inconsistent border radius, minor whitespace irregularity.

## Table of Contents

- [Desktop Agent Checklist](#desktop-agent-checklist)
- [Mobile Agent Checklist](#mobile-agent-checklist)
- [Cross-Cutting](#cross-cutting)

---

## Desktop Agent Checklist

Review both the light and dark screenshots at 1920x1080. Compare them side-by-side mentally.

### Layout & Alignment

- Elements align to a consistent grid or visual rhythm
- No unexpected gaps or overlapping elements
- Visual hierarchy is clear: headings > subheadings > body
- Sidebars, cards, and panels have consistent widths
- Nothing is cut off at viewport edges
- Content is appropriately constrained in width (not stretching to fill all 1920px — look for uncomfortably wide text blocks or stretched layouts)
- Main content area appears centered or properly positioned with balanced margins

### Typography

- Font sizes follow a visually clear scale (no sizes that look out of place)
- Body text lines appear comfortably readable in length (not spanning the full viewport width)
- Heading hierarchy is visually distinct (H1 > H2 > H3)
- Text is legible and properly rendered (no obviously wrong fonts or garbled text)

### Spacing

- Padding inside containers is consistent
- Margins between sections follow a rhythm
- Card/panel internal spacing is uniform
- No elements touching edges without padding

### Content Integrity

- No text truncation cutting off meaningful content
- No placeholder text left in (e.g., "Lorem ipsum")
- Images are properly sized (not stretched or squished)
- No broken image placeholders or missing icon glyphs (empty boxes)
- SVG/icon elements render correctly (not blank or misaligned)

### Stacking & Clipping

- No elements rendered behind others when they should be on top (dropdowns behind modals, tooltips clipped by containers)
- Sticky headers/footers not obscuring content they shouldn't
- No meaningful content clipped by parent containers (text or UI cut off mid-word or mid-element)

### Form & Validation States

- Form error states are visually clear (if visible in screenshot)
- Required field indicators are visible
- Inline validation messages are readable and positioned correctly

### Dark Mode Comparison (Desktop)

Compare light and dark screenshots for these issues:
- Text that becomes invisible or near-invisible against dark backgrounds
- Borders/dividers that disappear in dark mode
- Shadows that create artifacts on dark backgrounds
- Background color patches that don't match the dark theme (leftover white/light areas)
- Images or icons that look wrong against dark backgrounds
- Focus rings or selection states that lose visibility
- Any layout shifts between light and dark (elements moving or resizing)
- Every background area should have changed (no leftover light-theme patches)
- Icons should adapt or remain visible in both themes

### Interactive States (Desktop)

- Buttons look clickable (visual affordance via color, shadow, or shape)
- Links are distinguishable from plain text
- Disabled elements look visually muted
- Form inputs have visible boundaries
- Elements that should be interactive look interactive (do not test hover — just check visual affordance)

---

## Mobile Agent Checklist

Review both the light and dark screenshots at 375x812. Compare them side-by-side mentally.

### Responsive Layout

- Content stacks vertically without horizontal overflow
- No elements extending beyond the viewport width
- Cards and containers fill width appropriately
- No side-by-side layouts that are too cramped at 375px
- Proper content reflow from desktop layout

### Touch Targets

- Buttons and links appear large enough to comfortably tap (not tiny or cramped)
- Adequate spacing between tappable elements (no risk of accidental taps)
- Form inputs appear large enough to tap accurately
- Close buttons and small icons are not unreasonably tiny
- No small text links that would be difficult to tap

### Typography & Readability

- Body text appears readable without zooming (not obviously too small)
- No text so small it would require pinching to read
- Headings scale down appropriately from desktop
- Text does not run beyond the viewport edges

### Navigation Patterns

- Navigation is accessible (hamburger menu, tab bar, or equivalent)
- No desktop-only navigation left unhandled at mobile width
- Back/close actions are clearly available
- Modal/overlay navigation works at mobile width

### Stacking & Clipping (Mobile)

- No modals or overlays extending beyond mobile viewport
- Bottom sheets or drawers render cleanly at 375px width
- No content clipped by overflow-hidden containers

### Dark Mode Comparison (Mobile)

Compare light and dark screenshots for these issues:
- Text that becomes invisible or near-invisible against dark backgrounds
- Borders/dividers that disappear in dark mode
- Shadows that create artifacts on dark backgrounds
- Background color patches that don't match the dark theme (leftover white/light areas)
- Images or icons that look wrong against dark backgrounds
- Focus rings or selection states that lose visibility
- Any layout shifts between light and dark (elements moving or resizing)
- Bottom navigation/tab bar remains visible in dark mode
- Mobile-specific components (bottom sheets, FABs) theme correctly

### Interactive States (Mobile)

- Touch targets have visible boundaries or backgrounds
- Form elements are clearly interactive
- Toggle switches and checkboxes are clearly styled
- No elements that look tappable but aren't (or vice versa)

---

## Cross-Cutting

### Targeted Element Review

When `focus_elements` are provided in the verification context:

- Apply extra scrutiny to the specified selectors/components
- Check alignment and spacing relative to surrounding elements
- Verify correct theme adaptation in both light and dark
- Confirm content integrity (no truncation, correct text)
- Check that the focused element looks visually consistent with the surrounding UI (consistent spacing, alignment, and styling)

When `interactions` are provided:

- After performing each interaction, verify the resulting state looks correct
- Verify the end state appears complete (no half-rendered overlays, partially visible elements, or incomplete state changes)
- Verify the interaction result in both light and dark mode
- Confirm the interaction result is usable at the current viewport size
