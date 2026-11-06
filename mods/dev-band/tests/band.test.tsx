import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { TurnUsage } from 'claude-code'

const BAND = {
  plugin: 'dev-band',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const CONTEXT = { percent: 43, tokens: 86_000, window: 200_000 }
const AGENTS = [
  { id: 'a1', description: 'Explore the repo' },
  { id: 'a2', description: 'Write the tests' },
]
const SURFACES = ['terminal', 'desktop'] as const

type Dollar = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

function seed(on: On, values: { context?: typeof CONTEXT; agents?: typeof AGENTS; cache?: unknown }) {
  const byKey: Record<string, unknown> = values
  on('state.get', ($, e, next) =>
    e.key in byKey ? { value: { value: byKey[e.key], version: 1 } } : next(e),
  )
}

async function spend($: Dollar, on: On, ...totals: number[]) {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  for (const usd of totals) {
    await $.session.measure({ context: { window: 200_000 }, rateLimits: [], cost: { usd }, changed: ['cost'] })
  }
}

const MINUTE = 60_000
const MODEL = 'claude-opus-5-5'
const WRITE = { read: 0, write: 50_000 }
const HIT = { read: 50_000, write: 200 }

function cacheSteps(on: On) {
  let usage: TurnUsage | null = null
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('classic.SessionStart', () => ({}))

  return async ($: Dollar, tokens: { read: number; write: number }, agentId?: string) => {
    usage = {
      input_tokens: 10,
      output_tokens: 100,
      cache_read_input_tokens: tokens.read,
      cache_creation_input_tokens: tokens.write,
      model: MODEL,
    }
    const stream = $.turn.step({
      turnId: 't1',
      index: 0,
      model: MODEL,
      messageCount: 1,
      ...(agentId === undefined ? {} : { agentId }),
    })
    for await (const _ of stream) void _
  }
}

async function bandWords($: Dollar, surface: (typeof SURFACES)[number], bodyColumns: number = BAND.props.bodyColumns) {
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const alts = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  await ui.unmount()

  return [...texts, ...alts].join(' ')
}

test('the band shows the context fill, the running agents and the cost', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  seed(on, { context: CONTEXT, agents: AGENTS })
  await spend($, on, 1.234)

  for (const surface of SURFACES) {
    const words = await bandWords($, surface)

    expect(words).toMatch(/43%/)
    expect(words).toMatch(/86k \/ 200k/)
    expect(words).toMatch(/2 个子代理/)
    expect(words).toMatch(/\$1\.23/)
  }
})

test('the agents segment is hidden while no agent runs', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  seed(on, { context: CONTEXT, agents: [] })
  await spend($, on, 0.5)

  for (const surface of SURFACES) {
    const words = await bandWords($, surface)

    expect(words).toMatch(/43%/)
    expect(words).not.toMatch(/子代理/)
  }
})

test('each new total adds to the cost history, which keeps the last 12', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  let stored: unknown
  on('state.set', ($, e, next) => {
    if (e.key === 'cost') stored = e.value
    return next(e)
  })
  const totals = Array.from({ length: 14 }, (_, i) => i + 1)
  await spend($, on, ...totals, 14, 12)

  const cost = (stored as { value: { usd: number; previousUsd: number; history: { delta: number }[] } }).value

  expect(cost.usd).toBe(14)
  expect(cost.previousUsd).toBe(13)
  expect(cost.history.map(entry => entry.delta)).toEqual(Array.from({ length: 12 }, () => 1))
})

test('the cost change shows only while it is fresh', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  await spend($, on, 1, 1.12)

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/\+\$0\.12/)

  await clock.advance(10_000)

  for (const surface of SURFACES) {
    const words = await bandWords($, surface)

    expect(words).toMatch(/\$1\.12/)
    expect(words).not.toMatch(/\+\$0\.12/)
  }
})

test('with nothing to show the band is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('the cache segment is hidden before any response', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  seed(on, { context: CONTEXT, agents: [] })

  for (const surface of SURFACES) {
    const words = await bandWords($, surface)

    expect(words).toMatch(/43%/)
    expect(words).not.toMatch(/缓存/)
  }
})

test('the cache counts down from the last main-thread response', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?1 小时/)

  await clock.advance(18 * MINUTE)
  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?42 分钟/)

  await clock.advance(40 * MINUTE + 30_000)
  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?1:30/)

  await clock.advance(MINUTE)
  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?0:30/)
})

test('a miss after a gap past five minutes reads as a 5m cache', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)
  await clock.advance(10 * MINUTE)
  await step($, WRITE)

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?5 分钟/)

  await clock.advance(4 * MINUTE)
  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?1:00/)
})

test('a hit after a gap past five minutes reads as a 1h cache, and a later miss keeps it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)
  await clock.advance(10 * MINUTE)
  await step($, HIT)
  await clock.advance(10 * MINUTE)
  await step($, WRITE)

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?1 小时/)
})

test('the cache shows expired once its TTL has passed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)
  await clock.advance(61 * MINUTE)

  for (const surface of SURFACES) {
    const words = await bandWords($, surface)

    expect(words).toMatch(/缓存 ?已过期/)
    expect(words).not.toMatch(/缓存(剩余)? ?\d/)
  }
})

test('a subagent response does not reset the cache timer', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)
  await clock.advance(30 * MINUTE)
  await step($, HIT, 'a1')

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?30 分钟/)
})

test('a resumed session counts from its last response', async ($, on) => {
  mock.clock(on, { now: 10_000_000 })
  cacheSteps(on)
  await $.classic.SessionStart({
    source: 'resume',
    seconds_since_last_response: 600,
    prompt_cache_likely_expired: false,
  })

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?50 分钟/)
})

test('a resume the engine calls expired after ten minutes reads as a 5m cache', async ($, on) => {
  mock.clock(on, { now: 10_000_000 })
  cacheSteps(on)
  await $.classic.SessionStart({
    source: 'resume',
    seconds_since_last_response: 600,
    prompt_cache_likely_expired: true,
  })

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存 ?已过期/)
})

test('a compaction leaves the cache cold until the next response', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const step = cacheSteps(on)
  await step($, WRITE)
  await $.classic.SessionStart({ source: 'compact' })

  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存 ?未缓存/)

  await step($, WRITE)
  for (const surface of SURFACES) expect(await bandWords($, surface)).toMatch(/缓存(剩余)? ?1 小时/)
})

test('a cache value stored without its shape is declined', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  seed(on, { context: CONTEXT, agents: [], cache: { sentAt: 999_000, ttl: '1h' } })

  for (const surface of SURFACES) expect(await bandWords($, surface)).not.toMatch(/缓存/)
})

async function crowdedBand(on: On) {
  mock.clock(on, { now: 1_000_000 })
  seed(on, { context: CONTEXT, agents: [AGENTS[0]!] })
  const step = cacheSteps(on)

  return step
}

test('a narrow terminal band drops the least important parts first', async ($, on) => {
  const step = await crowdedBand(on)
  await spend($, on, 0.5, 1.0, 1.5)
  await step($, WRITE)
  const at = (columns: number) => bandWords($, 'terminal', columns)

  const wide = await at(200)
  for (const part of [/███ ██ █/, /\+\$0\.50/, /Explore the repo/, /1 个子代理/, /86k \/ 200k/, /\$1\.50/, /缓存 1 小时/]) {
    expect(wide).toMatch(part)
  }

  expect(await at(82)).not.toMatch(/███ ██ █/)
  expect(await at(82)).toMatch(/\+\$0\.50/)
  expect(await at(78)).not.toMatch(/\+\$0\.50/)
  expect(await at(78)).toMatch(/Explore the repo/)
  expect(await at(75)).toMatch(/1 个子代理/)
  expect(await at(66)).not.toMatch(/Explore the repo/)
  expect(await at(66)).not.toMatch(/子代理/)
  expect(await at(66)).toMatch(/◐ 1/)
  expect(await at(66)).toMatch(/86k/)
  expect(await at(60)).not.toMatch(/86k/)
  expect(await at(60)).toMatch(/\$1\.50/)
  expect(await at(52)).not.toMatch(/\$1\.50/)
  expect(await at(52)).toMatch(/缓存 1 小时/)

  const tiny = await at(20)
  expect(tiny).not.toMatch(/缓存/)
  expect(tiny).toMatch(/43%/)
  expect(tiny).toMatch(/1 小时/)
})

test('a narrow desktop band drops the least important parts first', async ($, on) => {
  const step = await crowdedBand(on)
  await spend($, on, 0.5, 1.0, 1.5)
  await step($, WRITE)
  const at = (columns: number) => bandWords($, 'desktop', columns)

  const wide = await at(200)
  for (const part of [/最近 3 轮的花费/, /本轮 \+\$0\.50/, /Explore the repo/, /86k \/ 200k/, /花费 \$1\.50/]) {
    expect(wide).toMatch(part)
  }

  expect(await at(70)).not.toMatch(/最近 3 轮的花费/)
  expect(await at(70)).toMatch(/本轮/)
  expect(await at(66)).not.toMatch(/本轮/)
  expect(await at(66)).toMatch(/Explore the repo/)
  expect(await at(62)).not.toMatch(/Explore the repo/)
  expect(await at(62)).toMatch(/86k/)
  expect(await at(58)).toMatch(/花费 \$1\.50/)
  expect(await at(52)).not.toMatch(/86k/)
  expect(await at(52)).not.toMatch(/花费/)

  const tiny = await at(20)
  expect(tiny).not.toMatch(/花费/)
  expect(tiny).toMatch(/上下文已用 43%/)
  expect(tiny).toMatch(/缓存剩余 1 小时/)
})

test('no label of the band may wrap', async ($, on) => {
  const step = await crowdedBand(on)
  await spend($, on, 0.5, 1.0, 1.5)
  await step($, WRITE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const texts = await ui.findAll({ type: 'Text' })
    await ui.unmount()

    for (const text of texts) expect(text.props.wrap).toBe('truncate-end')
  }
})
