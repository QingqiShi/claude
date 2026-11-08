import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const NOW = Date.parse('2026-11-07T06:00:00Z')
const SERVER = 'https://buddy.test'
const PUBLIC_KEY = 'A'.repeat(43) + '='
const LINK = { server: SERVER, user: 'qingqi', machine: 'mac-abcdefghij', name: 'Test Mac', connectedAt: NOW - 86_400_000 }

type Call = { url: string; method: string; headers: Record<string, string>; body: string }
type Run = { argv: readonly string[]; stdin: string | undefined }

const STATE: Record<string, unknown> = {
  scan: {
    shape: 'scan-1',
    value: { ranAt: NOW, firstDay: '2026-11-06', days: [{ day: '2026-11-06', tokens: 1200, costUsd: 0.5 }], totals: { tokens: 1200, costUsd: 0.5, cacheHitRate: 0 }, previous: null },
  },
  quota: { shape: 'quota-1', value: { at: null, five: null, week: null, samples: [] } },
  party: { number: 7, title: 'secret title', repo: 'owner/secret-repo', until: NOW + 60_000 },
  pet: { shape: 'pet-1', value: { action: null, actionAt: 0, line: null, fed: 1, patted: 2 } },
  env: { repo: 'secret-repo', tzOffsetMin: 480 },
  growth: { highest: 1, levelUp: null },
}

const pane = {
  plugin: 'sprout',
  component: 'Pane',
  requestId: 'sprout',
  surface: 'desktop',
  props: { title: '小苗', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 200 }, view: {} },
} as const

/** A Buddy that answers as told, and a `buddy.mjs` that answers from memory, with `node`, the Keychain and `open` in place. */
function world(on: Parameters<TestBody>[1], server: { poll: unknown; upload: number }, buddy: Record<string, unknown>, store: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: NOW })
  on('settings.read', () => ({ value: { language: '中文' } }))
  mock.store(on, { nodePath: '/usr/bin/node', ...store })
  mock.env(on, { HOME: '/Users/me', SPROUT_BUDDY_SERVER: SERVER })
  const calls: Call[] = []
  const runs: Run[] = []
  const state = new Map<string, unknown>(Object.entries({ ...STATE, buddy: { shape: 'buddy-1', value: buddy } }))
  const versions = new Map<string, number>()
  on('state.get', (_, e) => {
    const { key } = e as { key: string }
    return { value: { value: state.get(key), version: versions.get(key) ?? 1 } }
  })
  on('state.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    state.set(key, value)
    const version = (versions.get(key) ?? 1) + 1
    versions.set(key, version)
    return { value: { isSet: true, version } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    const [exe, script = '', command = ''] = e.argv
    const reply = script.endsWith('buddy.mjs')
      ? JSON.stringify(command === 'key' ? { publicKey: PUBLIC_KEY } : command.startsWith('sign') ? { signature: 'c2ln' } : { ok: true })
      : exe === '/usr/bin/node'
        ? 'v24.0.0'
        : 'Test Mac\n'
    return { value: { exitCode: 0, stdout: reply, stderr: '', isStdoutTruncated: false, isStderrTruncated: false, stream: 'stdout' as const } }
  })
  on('http.fetch', (_, e) => {
    const method = e.init?.method ?? 'GET'
    calls.push({ url: e.url, method, headers: e.init?.headers ?? {}, body: e.init?.body ?? '' })
    const path = e.url.slice(SERVER.length)
    const answer = (status: number, body: unknown) => ({ value: { status, ok: status < 300, headers: {}, text: JSON.stringify(body) } })
    if (path === '/api/v1/connect') return answer(200, { requestId: 'r'.repeat(43), code: 'BCDF-GHJK', url: `${SERVER}/connect?code=BCDF-GHJK`, expiresIn: 600, interval: 5 })
    if (path.startsWith('/api/v1/connect/')) return answer(200, server.poll)
    if (path.endsWith('/upload')) return answer(server.upload, server.upload === 200 ? { ok: true } : { error: 'unauthorized' })
    if (path.endsWith('/others')) return answer(200, { user: 'qingqi', firstDay: '2026-11-01', days: [{ day: '2026-11-01', tokens: 5, costUsd: 0.1 }] })
    return answer(404, {})
  })
  const buddyNow = () => (state.get('buddy') as { value: Record<string, unknown> }).value
  return { clock, calls, runs, state, buddyNow }
}

const READY = { isReady: true, link: null, connect: null, upload: null, error: null, note: null, isOfferHidden: false }

test('the sync button sends the Keychain key and the Mac name, opens the browser, and the approval stores the link and uploads at once', async ($, on) => {
  const w = world(on, { poll: { status: 'approved', user: 'qingqi', machine: { id: 'mac-abcdefghij', name: 'Test Mac' } }, upload: 200 }, READY)
  const ui = await $.ui.mount(pane)
  await ui.press({ key: 'buddy-sync' })

  const connect = w.calls.find(c => c.url === `${SERVER}/api/v1/connect`)
  expect(connect?.method).toBe('POST')
  expect(JSON.parse(connect?.body ?? '{}')).toEqual({ publicKey: PUBLIC_KEY, name: 'Test Mac' })
  expect(w.runs.some(r => r.argv[0] === '/usr/bin/open' && r.argv[1] === `${SERVER}/connect?code=BCDF-GHJK`)).toBe(true)
  expect((w.buddyNow().connect as { code: string }).code).toBe('BCDF-GHJK')

  await w.clock.advance(5000)
  const link = w.buddyNow().link
  expect(link).toEqual({ server: SERVER, user: 'qingqi', machine: 'mac-abcdefghij', name: 'Test Mac', connectedAt: NOW + 5000 })

  const upload = w.calls.find(c => c.url.endsWith('/upload'))
  expect(upload?.url).toBe(`${SERVER}/api/v1/u/qingqi/upload`)
  expect(upload?.headers['Buddy-Machine']).toBe('mac-abcdefghij')
  expect(upload?.headers['Buddy-Signature']).toBe('c2ln')
  expect(w.runs.find(r => r.argv.includes('sign-upload'))?.stdin).toBe(upload?.body)
  expect(upload?.body).not.toMatch(/secret/)
  expect(JSON.parse(upload?.body ?? '{}')).toMatchObject({ v: 1, at: NOW + 5000, tzOffsetMin: 480, party: { number: 7, until: NOW + 60_000 }, pet: { fed: 1, patted: 2 } })
  expect(w.calls.filter(c => c.url.endsWith('/others')).length).toBe(1)
  await ui.unmount()
})

test('/sprout sync uploads at once when the Mac is linked, and a refused upload shows as such and keeps the link', async ($, on) => {
  const w = world(on, { poll: { status: 'pending' }, upload: 401 }, { ...READY, link: LINK }, { buddy: LINK })

  const { text } = await $.command.run({ command: 'sprout', args: 'sync', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(text).toContain('不认这台 Mac')
  expect(w.calls.filter(c => c.url.endsWith('/upload')).length).toBe(1)
  expect(w.buddyNow().error).toBe('unauthorized')
  expect(w.buddyNow().link).toEqual(LINK)

  const ui = await $.ui.mount(pane)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('buddy-again')
  expect(drawn).toContain(`${SERVER}/u/qingqi`)
  await ui.unmount()
})

test('a denied or expired connect ends quietly with one note, and 不用 hides the offer across sessions', async ($, on) => {
  const w = world(on, { poll: { status: 'denied' }, upload: 200 }, READY)
  const ui = await $.ui.mount(pane)
  await ui.press({ key: 'buddy-sync' })
  await w.clock.advance(5000)
  expect(w.buddyNow().connect).toBe(null)
  expect(w.buddyNow().link).toBe(null)
  expect(typeof w.buddyNow().note).toBe('string')
  expect(w.calls.filter(c => c.url.endsWith('/upload')).length).toBe(0)

  await ui.press({ key: 'buddy-no' })
  expect(w.buddyNow().isOfferHidden).toBe(true)
  await ui.unmount()
})

test('/sprout disconnect forgets the link but keeps the Keychain key, so the next connect sends the same key', async ($, on) => {
  const w = world(on, { poll: { status: 'pending' }, upload: 200 }, { ...READY, link: LINK }, { buddy: LINK })

  await $.command.run({ command: 'sprout', args: 'disconnect', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(w.buddyNow().link).toBe(null)
  expect(w.runs.filter(r => r.argv.some(arg => arg.endsWith('buddy.mjs') || arg === '/usr/bin/security'))).toEqual([])

  await $.command.run({ command: 'sprout', args: 'sync', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const connect = w.calls.find(c => c.url === `${SERVER}/api/v1/connect`)
  expect(JSON.parse(connect?.body ?? '{}')).toMatchObject({ publicKey: PUBLIC_KEY })
})
