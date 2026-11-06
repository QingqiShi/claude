import { expect, mock, test } from 'claude-code/testing'

import { asMerges, fetchChunk, mergeQuery, parseScan, withChunk } from '../hooks/data'
import { addDays, chunksOf, mergedFrom, planMergeChunks, rangeFrom, rangeTotals } from '../hooks/logic'
import type { SproutDay, SproutMerges, SproutScan } from '../types'

const TODAY = '2026-11-06'

const DAYS: SproutDay[] = [
  { day: '2026-08-11', tokens: 1000, costUsd: 10, cacheRead: 100, promptTokens: 900 },
  { day: '2026-10-07', tokens: 500, costUsd: 5, cacheRead: 300, promptTokens: 400 },
  { day: '2026-10-08', tokens: 200, costUsd: 2, cacheRead: 150, promptTokens: 180 },
  { day: TODAY, tokens: 300, costUsd: 3, cacheRead: 250, promptTokens: 270 },
]

test('the 30-day range starts 29 days back and the whole range at the first day of Claude data', async () => {
  expect(rangeFrom('30', TODAY, '2026-08-11')).toBe('2026-10-08')
  expect(rangeFrom('all', TODAY, '2026-08-11')).toBe('2026-08-11')
  expect(rangeFrom('all', TODAY, null)).toBe('2026-10-08')
})

test('the tiles add up tokens, cost and the cache hit rate over the range alone', async () => {
  const recent = rangeTotals(DAYS, rangeFrom('30', TODAY, '2026-08-11'), 0.5)
  expect(recent.tokens).toBe(500)
  expect(recent.costUsd).toBe(5)
  expect(recent.cacheHitRate).toBe(400 / 450)

  const all = rangeTotals(DAYS, rangeFrom('all', TODAY, '2026-08-11'), 0.5)
  expect(all.tokens).toBe(2000)
  expect(all.costUsd).toBe(20)
  expect(all.cacheHitRate).toBe(800 / 1750)
})

test('a scan stored before the cache counts were kept still loads, with the all-time hit rate', async () => {
  const old = DAYS.map(({ day, tokens, costUsd }) => ({ day, tokens, costUsd }))
  const totals = rangeTotals(old, '2026-10-08', 0.42)
  expect(totals.tokens).toBe(500)
  expect(totals.cacheHitRate).toBe(0.42)
})

test('a scan keeps the cache reads and every input-side token of each day', async () => {
  const line = JSON.stringify({
    version: 1,
    firstDay: '2026-08-11',
    days: [{ day: '2026-08-11', input: 10, output: 5, cacheRead: 60, cacheWrite: 30, costUsd: 1 }],
    totals: { tokens: 105, costUsd: 1, cacheHitRate: 0.6 },
  })
  const scan = parseScan(`progress\n${line}\n`, 1)
  expect(scan?.days).toEqual([{ day: '2026-08-11', tokens: 105, costUsd: 1, cacheRead: 60, promptTokens: 100 }])
})

test('merges are planned in fixed 14-day chunks back to the start, newest first', async () => {
  const chunks = chunksOf('2026-08-11', TODAY)
  expect(chunks.at(-1)!.from <= '2026-08-11').toBe(true)
  expect(chunks[0]!.from <= TODAY && chunks[0]!.to >= TODAY).toBe(true)
  for (const [i, c] of chunks.entries()) {
    const next = chunks[i + 1]
    if (next !== undefined) expect(next.to < c.from).toBe(true)
  }
  expect(chunks.length).toBe(8)
  const later = chunksOf('2026-08-11', addDays(TODAY, 20))
  expect(later.length).toBeGreaterThan(chunks.length)
  expect(later.slice(later.length - chunks.length)).toEqual(chunks)
})

test('a refresh fetches the chunks never fetched, the last 30 days when due, and an old chunk fetched before it was over', async () => {
  const chunks = chunksOf('2026-08-11', TODAY)
  const recent = chunks.filter(c => c.to >= '2026-10-08')
  const old = chunks.filter(c => c.to < '2026-10-08')
  expect(recent.length).toBe(3)

  expect(planMergeChunks('2026-08-11', TODAY, [], false)).toEqual(chunks)

  const done = chunks.map(c => ({ ...c, asOf: TODAY }))
  expect(planMergeChunks('2026-08-11', TODAY, done, false)).toEqual([])
  expect(planMergeChunks('2026-08-11', TODAY, done, true)).toEqual(recent)

  const early = done.map(c => (c.from === old[0]!.from ? { ...c, asOf: c.to } : c))
  expect(planMergeChunks('2026-08-11', TODAY, early, false)).toEqual([old[0]])
  const dayAfter = done.map(c => (c.from === old[0]!.from ? { ...c, asOf: addDays(c.to, 1) } : c))
  expect(planMergeChunks('2026-08-11', TODAY, dayAfter, false)).toEqual([old[0]])
  const twoDaysAfter = done.map(c => (c.from === old[0]!.from ? { ...c, asOf: addDays(c.to, 2) } : c))
  expect(planMergeChunks('2026-08-11', TODAY, twoDaysAfter, false)).toEqual([])

  const missing = done.filter(c => c.from !== old[1]!.from)
  expect(planMergeChunks('2026-08-11', TODAY, missing, false)).toEqual([old[1]])
  expect(mergedFrom(missing)).toBe(old[0]!.from)
  expect(mergedFrom(done)).toBe(chunks.at(-1)!.from)

  expect(planMergeChunks('2026-10-20', TODAY, [], false)).toEqual(chunksOf('2026-10-20', TODAY))
})

test('a chunk is searched by its dates with a day of slack either side, and a failed page saves nothing of it', async () => {
  const chunk = { from: '2026-10-01', to: '2026-10-14' }
  expect(mergeQuery(chunk, null)).toContain('merged:2026-09-30..2026-10-15')
  expect(mergeQuery(chunk, 'abc')).toContain(',after:"abc"')

  const page = (nodes: object[], next: string | null) => ({
    data: { search: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes } },
  })
  const replies = [
    page(
      [
        { mergedAt: '2026-09-30T12:00:00Z', additions: 1, deletions: 1 },
        { mergedAt: '2026-10-01T12:00:00Z', additions: 5, deletions: 2 },
      ],
      'p2',
    ),
    page([{ mergedAt: '2026-10-14T12:00:00Z', additions: 3, deletions: 0 }], null),
  ]
  const asked: string[] = []
  const days = await fetchChunk(
    async query => {
      asked.push(query)
      return replies[asked.length - 1]
    },
    chunk,
    0,
  )
  expect(asked.length).toBe(2)
  expect(days).toEqual([
    { day: '2026-10-01', prs: 1, additions: 5, deletions: 2 },
    { day: '2026-10-14', prs: 1, additions: 3, deletions: 0 },
  ])

  let calls = 0
  const failed = await fetchChunk(
    async () => {
      calls += 1
      return calls === 1 ? replies[0] : null
    },
    chunk,
    0,
  )
  expect(failed).toBe(null)
})

test('a fetched chunk replaces its own days and keeps the rest', async () => {
  const merges: SproutMerges = {
    fetchedAt: 1,
    from: '2026-10-15',
    tzOffsetMin: 0,
    chunks: [{ from: '2026-10-15', to: '2026-10-28', asOf: TODAY }],
    days: [
      { day: '2026-10-05', prs: 9, additions: 9, deletions: 9 },
      { day: '2026-10-20', prs: 1, additions: 1, deletions: 1 },
    ],
  }
  const next = withChunk(merges, { from: '2026-10-01', to: '2026-10-14', asOf: TODAY }, [{ day: '2026-10-02', prs: 2, additions: 4, deletions: 6 }])
  expect(next.days.map(d => d.day)).toEqual(['2026-10-02', '2026-10-20'])
  expect(next.from).toBe('2026-10-01')
  expect(next.chunks.map(c => c.from)).toEqual(['2026-10-01', '2026-10-15'])
})

test('merges stored before chunks still load, with every chunk left to fetch', async () => {
  const old = { fetchedAt: 5, from: '2026-10-08', days: [{ day: '2026-11-01', prs: 3, additions: 1, deletions: 2 }] }
  expect(asMerges(old)).toEqual({ ...old, tzOffsetMin: null, chunks: [] })
  expect(asMerges({ days: [] })).toBe(null)
  expect(asMerges(null)).toBe(null)
})

const NOW = Date.parse(`${TODAY}T12:00:00Z`)

const SCAN: SproutScan = {
  ranAt: NOW,
  firstDay: '2026-08-11',
  days: DAYS,
  totals: { tokens: 2000, costUsd: 20, cacheHitRate: 800 / 1750 },
  previous: null,
}

const MERGES: SproutMerges = {
  fetchedAt: NOW,
  from: '2026-08-06',
  tzOffsetMin: 0,
  chunks: [],
  days: [
    { day: '2026-08-20', prs: 7, additions: 700, deletions: 70 },
    { day: '2026-11-01', prs: 2, additions: 20, deletions: 2 },
  ],
}

const SEEDED: Record<string, unknown> = {
  scan: { shape: 'scan-1', value: SCAN },
  merges: { shape: 'merges-2', value: MERGES },
  env: { repo: 'sprout', tzOffsetMin: 0 },
}

const PANE = {
  plugin: 'sprout',
  component: 'Pane',
  requestId: 'sprout',
  props: { title: '芽团', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the tiles, the token trend and the merges follow the one range, and the choice is kept', async ($, on) => {
  mock.clock(on, { now: NOW })
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('state.get', (_, e, next) => (e.key in SEEDED ? { value: { value: SEEDED[e.key], version: 1 } } : next(e)))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /30 天 2 个 PR/ })).toBeTruthy()
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Text', text: '最近 30 天' })).toBeTruthy()
    } else {
      expect(await ui.find({ type: 'Text', text: /30 天 500 token · \$5\.00 · .*缓存命中 88\.9%/})).toBeTruthy()
    }

    await ui.press({ key: 'range-all' })
    expect(await ui.find({ type: 'Text', text: /88 天 9 个 PR/ })).toBeTruthy()
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Text', text: '自 8 月 11 日起' })).toBeTruthy()
    } else {
      expect(await ui.find({ type: 'Text', text: /累计 2k token · \$20 · .*缓存命中 45\.7%/ })).toBeTruthy()
    }
    expect(store.get('range')).toBe('all')

    await ui.press({ key: 'range-30' })
    expect(await ui.find({ type: 'Text', text: /30 天 2 个 PR/ })).toBeTruthy()
    expect(store.get('range')).toBe('30')
    await ui.unmount()
  }
})

test('the first tile names the range it adds up', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  on('state.get', (_, e, next) => (e.key in SEEDED ? { value: { value: SEEDED[e.key], version: 1 } } : next(e)))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const sources = async () => (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.source))
  expect((await sources()).some(source => source.includes('>30 天 token<'))).toBe(true)
  expect((await sources()).some(source => source.includes('>累计 token<'))).toBe(false)

  await ui.press({ key: 'range-all' })
  expect((await sources()).some(source => source.includes('>累计 token<'))).toBe(true)
  expect((await sources()).some(source => source.includes('>30 天 token<'))).toBe(false)
  await ui.unmount()
})

test('a new session starts on the range chosen last', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, { range: 'all' })
  on('state.get', (_, e, next) => (e.key in SEEDED ? { value: { value: SEEDED[e.key], version: 1 } } : next(e)))
  on('command.register', () => ({ value: { command: 'sprout' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '自 8 月 11 日起' })).toBeTruthy()
  await ui.unmount()
})
