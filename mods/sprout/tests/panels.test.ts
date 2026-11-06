import { expect, test } from 'claude-code/testing'

import { introStep } from '../hooks/logic'
import { tilesSvg, trendSvg, usageHeatmapSvg } from '../hooks/panels'
import type { SproutDay, SproutIntroKind } from '../types'

const DAYS: SproutDay[] = [
  { day: '2026-11-04', tokens: 1200, costUsd: 0.4 },
  { day: '2026-11-05', tokens: 0, costUsd: 0 },
  { day: '2026-11-06', tokens: 3400, costUsd: 1.1 },
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

const ENTRANCE = { tiles: /roll-|grow-|fade-|ring-/, trend: /pop-|draw-/, clay: /pop-/ }

const drawings = (isIntro: boolean) => ({
  tiles: tilesSvg({ ...TILES, isIntro }),
  trend: trendSvg(320, DAYS, isIntro) ?? '',
  clay: usageHeatmapSvg(320, DAYS, '2026-11-04', '2026-11-06', isIntro).svg,
})

test('a drawing with its entrance carries the entrance animations', async () => {
  const svgs = drawings(true)
  expect(svgs.tiles).toMatch(ENTRANCE.tiles)
  expect(svgs.trend).toMatch(ENTRANCE.trend)
  expect(svgs.clay).toMatch(ENTRANCE.clay)
})

test('a drawing without its entrance has no entrance animation and keeps its ambient ones', async () => {
  const svgs = drawings(false)
  expect(svgs.tiles).not.toMatch(ENTRANCE.tiles)
  expect(svgs.trend).not.toMatch(ENTRANCE.trend)
  expect(svgs.clay).not.toMatch(ENTRANCE.clay)
  expect(svgs.tiles).not.toMatch(/clipPath id="line-/)
  expect(svgs.tiles).toMatch(/class="[^"]*pulse-/)
  expect(svgs.trend).toMatch(/class="pulse-/)
  expect(svgs.clay).toMatch(/class="ring-/)
  for (const svg of Object.values(svgs)) expect(svg).toMatch(/prefers-reduced-motion/)
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
