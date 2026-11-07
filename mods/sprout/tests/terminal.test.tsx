import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import { addDays } from '../hooks/logic'
import { githubLevels } from '../hooks/panels'
import { INKS, cellWidth, decodeCells, encodeCells, rgb } from '../hooks/raster'
import { BODY, COLORS } from '../hooks/scene'
import { heatCells, heatGrid, meterCells, monthRow, sceneCells, treeRows, trendCells } from '../hooks/terminal'

const NOW = Date.parse('2026-11-07T06:00:00Z')
const TODAY = '2026-11-07'

const days = Array.from({ length: 60 }, (_, i) => {
  const tokens = i % 9 === 0 ? 0 : 2e8 + ((i * 7919) % 11) * 4e7
  return { day: addDays(TODAY, i - 59), tokens, costUsd: tokens / 2e6, cacheRead: tokens * 0.9, promptTokens: tokens }
})

const STATE: Record<string, unknown> = {
  scan: { shape: 'scan-1', value: { ranAt: NOW, firstDay: days[0]!.day, days, totals: { tokens: 21e9, costUsd: 11144, cacheHitRate: 0.97 }, previous: null } },
  quota: {
    shape: 'quota-1',
    value: { at: NOW, five: null, week: { pct: 28, resetsAt: NOW + 4 * 86_400_000 }, samples: [{ at: NOW - 86_400_000, week: 20 }, { at: NOW, week: 28 }] },
  },
  github: { shape: 'github-1', value: { fetchedAt: NOW, total: 3593, start: addDays(TODAY, -370), levels: '01234'.repeat(80).slice(0, 371) } },
  merges: {
    shape: 'merges-2',
    value: { fetchedAt: NOW, from: days[0]!.day, tzOffsetMin: 480, chunks: [], days: days.map((d, i) => ({ day: d.day, prs: i % 4, additions: i * 300, deletions: i * 120 })) },
  },
  party: null,
  pet: { shape: 'pet-1', value: { action: null, actionAt: 0, line: null, fed: 0, patted: 0 } },
  range: '30',
  env: { repo: 'shiqingqi.com', tzOffsetMin: 480 },
  growth: { highest: 2, levelUp: null },
}

const pane = (bodyColumns: number, bodyRows = 120, placement: 'dock' | 'inline' = 'dock') =>
  ({
    plugin: 'sprout',
    component: 'Pane',
    requestId: 'sprout',
    surface: 'terminal',
    props: { title: '芽团', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

function mockState(on: Parameters<TestBody>[1]) {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('state.get', (_, e) => ({ value: { value: STATE[(e as { key: string }).key], version: 1 } }))
}

async function drawn($: Parameters<TestBody>[0], ...size: Parameters<typeof pane>) {
  const ui = await $.ui.mount(pane(...size))
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

function walk(node: RenderElement | string, visit: (el: { type: string; props: Record<string, unknown> }) => void) {
  if (typeof node === 'string' || node === null || typeof node !== 'object') return
  const el = node as unknown as { type: string; props?: Record<string, unknown>; children?: Array<RenderElement | string> }
  visit({ type: el.type, props: el.props ?? {} })
  for (const child of el.children ?? []) walk(child, visit)
}

for (const [columns, rows] of [40, 60, 90, 140].flatMap(columns => [120, 49, 1].map(rows => [columns, rows] as const))) {
  test(`every Raster and every sized Box of the terminal pane fits ${columns} body columns in ${rows} rows`, async ($, on) => {
    mockState(on)
    const rasters: string[] = []
    walk(await drawn($, columns, rows), el => {
      if (el.type === 'Raster') {
        const { key, columns: cols, rows, cells } = el.props as { key: string; columns: number; rows: number; cells: string }
        rasters.push(key)
        expect(cols <= columns).toBe(true)
        expect(decodeCells(cells, cols).words.length).toBe(cols * rows * 3)
      }
      if (el.type === 'Box' && typeof el.props.width === 'number') expect(el.props.width <= columns).toBe(true)
    })
    expect(rasters).toEqual(['scene', 'meter-本周', 'trend', 'merges', 'clay', 'github'])
  })
}

test('the measured height is the height the terminal shows: 64 rows at 60 columns with room', async ($, on) => {
  mockState(on)
  // The person's 60-column terminal showed this layout with its last legend on row 56 of 64.
  expect(treeRows(await drawn($, 60, 120), 60)).toBe(64)
})

test('with room for every row, the pane draws its roomy layout, as it does inline', async ($, on) => {
  mockState(on)
  const layout = async (...size: Parameters<typeof pane>) => JSON.stringify(await drawn($, ...size)).replace(/"handle":\d+/g, '')
  const roomy = await layout(60, 120)
  expect(await layout(60, 64)).toBe(roomy)
  expect(await layout(60, 10, 'inline')).toBe(roomy)
  expect(await layout(60, 63)).not.toBe(roomy)
})

for (const columns of [40, 60, 90]) {
  test(`the pane fits the body's rows at ${columns} columns when it can, and draws its tightest when it cannot`, async ($, on) => {
    mockState(on)
    const roomy = treeRows(await drawn($, columns, 500), columns)
    const tightest = treeRows(await drawn($, columns, 1), columns)
    expect(tightest).toBeLessThan(roomy - 10)
    for (let rows = tightest - 3; rows <= roomy + 3; rows++) {
      const height = treeRows(await drawn($, columns, rows), columns)
      if (rows >= roomy) expect(height).toBe(roomy)
      else if (rows >= tightest) expect(height <= rows).toBe(true)
      else expect(height).toBe(tightest)
    }
  })
}

for (const rows of [120, 1]) {
  test(`the terminal pane keeps the pet buttons and the range buttons in ${rows} rows`, async ($, on) => {
    mockState(on)
    const keys: string[] = []
    walk(await drawn($, 60, rows), el => {
      if (el.type === 'Button') keys.push(String(el.props.key))
    })
    expect(keys).toEqual(['feed', 'pat', 'sass', 'range-30', 'range-all'])
  })
}

test('the scene draws the body grid in its own colors, two pixels to a cell', async () => {
  const pet = { mood: 'happy' as const, action: null, isConfetti: false, level: 3, pips: 2, isDay: true, text: '你好' }
  const scene = sceneCells(pet, 60)
  const cells = decodeCells(encodeCells(scene.cells), 60)
  const word = (x: number, row: number, k: number) => cells.words[(row * 60 + x) * 3 + k]!
  const crown = 4
  const ground = scene.cells.rows * 2 - 3
  const y0 = ground - (crown + BODY.length)
  const colorAt = (x: number, y: number) => {
    const row = Math.floor(y / 2)
    const glyph = String.fromCodePoint(word(x, row, 0))
    if (glyph === ' ') return word(x, row, 2)
    if (glyph === '▄') return y % 2 === 1 ? word(x, row, 1) : word(x, row, 2)
    return y % 2 === 0 ? word(x, row, 1) : word(x, row, 2)
  }
  BODY.forEach((line, by) =>
    [...line].forEach((ch, bx) => {
      if (ch !== '.') expect(colorAt(2 + bx, y0 + crown + by)).toBe(rgb(COLORS[ch]!))
    }),
  )
})

test('the meter fills to the usage, hatches up to the forecast and names both', async () => {
  const cells = meterCells(40, 28, 59, 'dark')
  const glyphs = Array.from({ length: 40 }, (_, x) => String.fromCodePoint(cells.words[x * 3]!)).join('')
  expect(glyphs).toContain('28%')
  expect(glyphs).toContain('→ 59%')
  expect(glyphs).toContain('╱')
  expect(glyphs.indexOf('╱')).toBeGreaterThan(glyphs.indexOf('28%'))
  expect(cells.words[(39 * 3) + 1]).toBe(INKS.dark.track)
})

test('the heatmap and its month row fit the width, a year at most', async () => {
  const levelOn = githubLevels(addDays(TODAY, -370), '1'.repeat(371))
  for (const width of [30, 60, 140]) {
    const { scale, weeks } = heatGrid(width)
    const cells = heatCells(levelOn, TODAY, width, 'light', { dark: ['#000000', '#111111', '#222222', '#333333'], light: ['#000000', '#111111', '#222222', '#333333'], ring: { dark: '#000000', light: '#000000' } })
    expect(cells.columns).toBe(weeks * scale)
    expect(cells.columns <= width).toBe(true)
    expect(weeks <= 53).toBe(true)
    expect(cellWidth(monthRow(TODAY, weeks, scale)) <= weeks * scale).toBe(true)
  }
})

test('the trend chart is as wide as asked for any number of days', async () => {
  for (const width of [40, 60, 140]) {
    expect(trendCells(days.slice(0, 2), width, 'dark').columns).toBe(width)
    expect(trendCells(days, width, 'dark').columns).toBe(width)
  }
})
