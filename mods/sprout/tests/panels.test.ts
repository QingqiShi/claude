import { expect, test } from 'claude-code/testing'

import { introStep } from '../hooks/logic'
import { githubHeatmapSvg, mergesSvg, tilesSvg, trendSvg, usageHeatmapSvg } from '../hooks/panels'
import type { SproutDay, SproutIntroKind, SproutMergeDay } from '../types'

const DAYS: SproutDay[] = [
  { day: '2026-11-04', tokens: 1200, costUsd: 0.4 },
  { day: '2026-11-05', tokens: 0, costUsd: 0 },
  { day: '2026-11-06', tokens: 3400, costUsd: 1.1 },
]

const MERGES: SproutMergeDay[] = [
  { day: '2026-11-04', prs: 3, additions: 40_000, deletions: 200 },
  { day: '2026-11-05', prs: 0, additions: 0, deletions: 0 },
  { day: '2026-11-06', prs: 1, additions: 12, deletions: 9 },
]

const TILES = {
  width: 320,
  tokens: 1_234_567,
  costUsd: 42.5,
  todayUsd: 3.2,
  streak: 4,
  week: [true, false, true, true, true, true, true],
  cacheHitRate: 0.91,
  bars: [1, 4, 2, 0, 3, 5, 2, 1, 6, 3],
  previous: { tokens: 1_000_000, costUsd: 40, cacheHitRate: 0.9 },
}

const ENTRANCE = { tiles: /roll-|grow-|fade-|ring-/, trend: /pop-|draw-/, merges: /up-|pop-/, clay: /pop-/, github: /gl-/ }

const GITHUB_START = '2025-11-02'
const GITHUB_LEVELS = '0'.repeat(368) + '43'

const drawings = (isIntro: boolean) => ({
  tiles: tilesSvg({ ...TILES, isIntro }),
  trend: trendSvg(320, DAYS, isIntro) ?? '',
  merges: mergesSvg(320, MERGES, isIntro) ?? '',
  clay: usageHeatmapSvg(320, DAYS, '2026-11-04', '2026-11-06', isIntro).svg,
  github: githubHeatmapSvg(320, GITHUB_START, GITHUB_LEVELS, '2026-11-06', isIntro).svg,
})

test('a drawing with its entrance carries the entrance animations', async () => {
  const svgs = drawings(true)
  expect(svgs.tiles).toMatch(ENTRANCE.tiles)
  expect(svgs.trend).toMatch(ENTRANCE.trend)
  expect(svgs.merges).toMatch(ENTRANCE.merges)
  expect(svgs.clay).toMatch(ENTRANCE.clay)
  expect(svgs.github).toMatch(ENTRANCE.github)
})

test('a drawing without its entrance has no entrance animation and keeps its ambient ones', async () => {
  const svgs = drawings(false)
  expect(svgs.tiles).not.toMatch(ENTRANCE.tiles)
  expect(svgs.trend).not.toMatch(ENTRANCE.trend)
  expect(svgs.merges).not.toMatch(ENTRANCE.merges)
  expect(svgs.clay).not.toMatch(ENTRANCE.clay)
  expect(svgs.github).not.toMatch(ENTRANCE.github)
  expect(svgs.tiles).not.toMatch(/clipPath id="line-/)
})

test('every chart marks today with the same pulse, which stops for reduced motion', async () => {
  const svgs = drawings(false)
  for (const svg of Object.values(svgs)) {
    expect(svg).toMatch(/class="[^"]*\btd[pr]-/)
    expect(svg).toMatch(/prefers-reduced-motion: reduce\)\{\.tdp-\w+\{animation:none\}/)
  }
})

test('the merge chart marks today even when nothing merged today', async () => {
  const quiet = [...MERGES.slice(0, 2), { day: '2026-11-06', prs: 0, additions: 0, deletions: 0 }]
  const svg = mergesSvg(320, quiet, false) ?? ''
  expect(svg).toMatch(/<circle class="prs-\w+ tdr-\w+"/)
  expect(svg).toContain('今天还没合并')
})

test('both heatmaps go from dark to bright in dark mode and from light to dark in light mode', async () => {
  const fills = (svg: string) => {
    const dark = svg.slice(0, svg.indexOf('@media (prefers-color-scheme: light)', svg.indexOf('.k0-')))
    const light = svg.slice(svg.indexOf('@media (prefers-color-scheme: light)', svg.indexOf('.k0-')))
    const pick = (css: string) => [1, 2, 3, 4].map(k => css.match(new RegExp(`\\.k${k}-\\w+\\{fill:(#[0-9A-F]{6})\\}`))?.[1] ?? '')
    return { dark: pick(dark), light: pick(light) }
  }
  const luma = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const svgs = drawings(false)
  for (const svg of [svgs.clay, svgs.github]) {
    const { dark, light } = fills(svg)
    const darkL = dark.map(luma)
    const lightL = light.map(luma)
    for (let i = 1; i < 4; i++) {
      expect(darkL[i] ?? 0).toBeGreaterThan(darkL[i - 1] ?? 0)
      expect(lightL[i] ?? 0).toBeLessThan(lightL[i - 1] ?? 0)
    }
  }
})

test('the GitHub heatmap uses Monday-first weeks like the usage heatmap, so a day sits in the same cell in both', async () => {
  const cellOf = (svg: string, kind: string) => {
    const m = svg.match(new RegExp(`<rect class="${kind}-[^"]*" x="([\\d.]+)" y="([\\d.]+)"`))
    return [Number(m?.[1]), Number(m?.[2])]
  }
  const github = githubHeatmapSvg(320, GITHUB_START, GITHUB_LEVELS, '2026-11-06', false)
  const usage = usageHeatmapSvg(320, [{ day: '2026-11-05', tokens: 9, costUsd: 0 }, { day: '2026-11-06', tokens: 5, costUsd: 0 }], '2026-11-05', '2026-11-06', false)
  expect(cellOf(github.svg, 'k4')).toEqual(cellOf(usage.svg, 'k4'))
  expect(github.height).toBe(usage.height)
  const rows = [...github.svg.matchAll(/<rect class="k\d-[^"]*" x="0" y="([\d.]+)"/g)].map(m => Number(m[1]))
  expect(rows.length).toBe(7)
  expect(github.svg).toMatch(/<text[^>]*>\d+ 月<\/text>/)
})

test('the merge chart stacks deletions on additions, so a day with more lines changed stands taller, by square root so a huge day does not flatten a small one', async () => {
  const days: SproutMergeDay[] = [
    { day: '2026-11-03', prs: 1, additions: 100, deletions: 300 },
    { day: '2026-11-04', prs: 3, additions: 40_000, deletions: 200 },
    { day: '2026-11-05', prs: 2, additions: 900, deletions: 0 },
    { day: '2026-11-06', prs: 1, additions: 12, deletions: 9 },
  ]
  const svg = mergesSvg(320, days, false) ?? ''
  const chart = svg.slice(svg.indexOf('<line'))
  const base = Number(chart.match(/y1="([\d.]+)"/)?.[1]) - 0.5
  const bars = [...chart.matchAll(/<g>(.*?)<\/g>/g)].map(([, bar]) => {
    const tops = [...(bar ?? '').matchAll(/class="(add|del)-[^"]*"(?: x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"| d="M[\d.]+,([\d.]+)V[\d.]+Q[\d.]+,([\d.]+))/g)].map(m =>
      m[2] === undefined ? { kind: m[1], top: Number(m[5]), bottom: Number(m[4]) } : { kind: m[1], top: Number(m[2]), bottom: Number(m[2]) + Number(m[3]) },
    )
    return tops
  })
  expect(bars.length).toBe(4)
  const heights = bars.map(segments => base - Math.min(...segments.map(s => s.top)))
  const totals = days.map(d => d.additions + d.deletions)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) if (totals[i]! > totals[j]!) expect(heights[i]!).toBeGreaterThan(heights[j]!)
  }
  expect(heights[3]! / heights[1]!).toBeGreaterThan(0.015)
  for (const segments of bars) {
    const add = segments.find(s => s.kind === 'add')
    const del = segments.find(s => s.kind === 'del')
    expect(Math.abs((add?.bottom ?? 0) - base)).toBeLessThan(0.2)
    if (del !== undefined) expect(Math.abs(del.bottom - (add?.top ?? 0))).toBeLessThan(0.2)
  }
  expect(bars[2]!.some(s => s.kind === 'del')).toBe(false)
  expect(chart.match(/<circle class="pr-/g)?.length).toBe(4)
  expect(svg).toContain('新增<tspan')
  expect(svg).toContain('+41k')
  expect(svg).toContain('−509')
  expect(svg).toContain('今天 1 个')
  expect(mergesSvg(320, [], false)).toBe(null)
})

test('the merge legend keeps its totals and drops the numbers of today before it runs into them', async () => {
  const busy: SproutMergeDay[] = [
    { day: '2026-11-05', prs: 290, additions: 384_000, deletions: 207_000 },
    { day: '2026-11-06', prs: 12, additions: 123_456, deletions: 98_765 },
  ]
  expect(mergesSvg(440, busy, false)).toContain('+123k')
  const narrow = mergesSvg(312, busy, false) ?? ''
  expect(narrow).toContain('今天 12 个')
  expect(narrow).not.toContain('+123k')
  expect(narrow).toContain('+507k')
})

test('a kind plays its entrance once a day, keeps it while its data stays, and draws still once the data changes', async () => {
  const seen = new Map<SproutIntroKind, string | null>()
  const first = introStep(seen, { tiles: 'a', trend: null }, {}, '2026-11-06')
  expect([...first.intro]).toEqual(['tiles'])
  expect(first.started).toEqual(['tiles'])

  const again = introStep(seen, { tiles: 'a', trend: 'x' }, { tiles: '2026-11-06' }, '2026-11-06')
  expect([...again.intro]).toEqual(['tiles', 'trend'])
  expect(again.started).toEqual(['trend'])

  expect([...introStep(seen, { tiles: 'b', trend: 'x' }, {}, '2026-11-06').intro]).toEqual(['trend'])
  expect([...introStep(seen, { tiles: 'a', trend: 'x' }, {}, '2026-11-06').intro]).toEqual(['trend'])

  const later = introStep(new Map(), { clay: 'c' }, { clay: '2026-11-06' }, '2026-11-06')
  expect(later.intro.size).toBe(0)
  expect(later.started).toEqual([])
})

test('the usage heatmap shows the past year in 53 weeks, empty before the first day, with the legend below and the today ring inside', async () => {
  const days: SproutDay[] = [{ day: '2026-10-01', tokens: 9000, costUsd: 3 }, ...DAYS]
  for (const width of [312, 440]) {
    const { height, svg } = usageHeatmapSvg(width, days, '2026-11-04', '2026-11-06', false)
    const rects = [...svg.matchAll(/<rect class="(k\d)-[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => {
      const [x, y, w, h] = m.slice(2).map(Number) as [number, number, number, number]
      return { kind: m[1], left: x, top: y, right: x + w, bottom: y + h }
    })
    const cells = rects.slice(0, -5)
    const legend = rects.slice(-5)
    const ring = svg.match(/<rect class="ring-[^"]*" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/)

    expect(new Set(cells.map(r => r.left)).size).toBe(53)
    expect(cells.filter(r => r.kind !== 'k0').length).toBe(2)
    expect(Math.min(...legend.map(r => r.top))).toBeGreaterThan(Math.max(...cells.map(r => r.bottom)))
    expect(height).toBeGreaterThanOrEqual(Math.max(...legend.map(r => r.bottom)))
    expect(svg).toContain(`height="${height}"`)
    expect(Number(ring?.[1]) + Number(ring?.[2]) + 0.75).toBeLessThanOrEqual(width)
  }
})
