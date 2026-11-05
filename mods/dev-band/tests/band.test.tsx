import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

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

function seed(on: On, values: { context?: typeof CONTEXT; agents?: typeof AGENTS }) {
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

async function bandWords($: Dollar, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ ...BAND, surface })
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
    expect(words).toMatch(/2 agents/)
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
    expect(words).not.toMatch(/agent/)
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
