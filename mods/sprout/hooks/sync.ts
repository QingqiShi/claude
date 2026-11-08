import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SproutBuddy, SproutBuddyLink, SproutConnect, SproutOthers, SproutUpload } from '../types'
import { BUDDY_DEFAULT_SERVER, machineName, normalizeServer, parseOthers, shouldUpload, uploadBodyOf, uploadHashOf } from './buddy'
import { t } from './i18n'
import { HOUR_MS, MINUTE_MS } from './logic'
import { findNode, note } from './tools'

// The engine reads state keys off each file's own source, so these atoms are written here and again in register.tsx.
const scanState = atom({ plugin: 'sprout', key: 'scan' } as const, null, { shape: 'scan-1' })
const quotaState = atom(
  { plugin: 'sprout', key: 'quota' } as const,
  { at: null, five: null, week: null, samples: [] },
  { shape: 'quota-1' },
)
const githubState = atom({ plugin: 'sprout', key: 'github' } as const, null, { shape: 'github-1' })
const mergesState = atom({ plugin: 'sprout', key: 'merges' } as const, null, { shape: 'merges-2' })
const partyState = atom({ plugin: 'sprout', key: 'party' } as const, null)
const petState = atom(
  { plugin: 'sprout', key: 'pet' } as const,
  { action: null, actionAt: 0, line: null, fed: 0, patted: 0 },
  { shape: 'pet-1' },
)
const envState = atom({ plugin: 'sprout', key: 'env' } as const, { repo: null, tzOffsetMin: null })
const growthState = atom({ plugin: 'sprout', key: 'growth' } as const, { highest: null, levelUp: null })
const buddyState = atom(
  { plugin: 'sprout', key: 'buddy' } as const,
  { isReady: null, link: null, connect: null, upload: null, error: null, note: null, isOfferHidden: false },
  { shape: 'buddy-1' },
)
const othersState = atom({ plugin: 'sprout', key: 'others' } as const, null, { shape: 'others-1' })

const STORE = { link: 'buddy', upload: 'buddyUpload', server: 'buddyServer', others: 'buddyOthers', offer: 'buddyOffer' } as const
const SECURITY = '/usr/bin/security'
const OPEN = '/usr/bin/open'
const OTHERS_MS = HOUR_MS
const CONNECT_TIMEOUT_MS = 10 * MINUTE_MS
const SCRIPT_TIMEOUT_MS = 20_000

let pollTimer: { cancel: () => void } | null = null
let isUploading = false

type Reply = Record<string, unknown>

export function stopBuddy() {
  pollTimer?.cancel()
  pollTimer = null
}

function isLink(value: unknown): value is SproutBuddyLink {
  const v = value as SproutBuddyLink | null
  return typeof v === 'object' && v !== null && typeof v.server === 'string' && typeof v.user === 'string' && typeof v.machine === 'string'
}

function isUpload(value: unknown): value is SproutUpload {
  const v = value as SproutUpload | null
  return typeof v === 'object' && v !== null && typeof v.at === 'number' && typeof v.hash === 'string'
}

function isOthers(value: unknown): value is SproutOthers {
  const v = value as SproutOthers | null
  return typeof v === 'object' && v !== null && typeof v.fetchedAt === 'number' && Array.isArray(v.days)
}

async function patch($: EngineInterface, change: Partial<SproutBuddy>) {
  return update($, buddyState, (buddy: SproutBuddy) => ({ ...buddy, ...change }))
}

/** Runs `scripts/buddy.mjs`, which keeps the key, and reads its one JSON line; null when it cannot run. */
async function script($: EngineInterface, args: string[], stdin?: string): Promise<Reply | null> {
  const now = await $.clock.now()
  const node = await findNode($, now)
  if (node === null) return null
  try {
    const result = await $.process.run([node, `${$.plugin.root}/scripts/buddy.mjs`, ...args], { stdin, timeoutMs: SCRIPT_TIMEOUT_MS })
    const line = result.stdout.trim().split('\n').at(-1) ?? ''
    const reply = JSON.parse(line) as Reply
    if (result.exitCode !== 0) note($, `buddy.mjs ${args[0]}: ${String(reply.error)} ${String(reply.detail ?? '')}`)

    return reply
  } catch (error) {
    note($, `buddy.mjs ${args[0]} failed: ${String(error)}`)

    return null
  }
}

type Fetched = { status: number; text: string } | { status: 0; text: '' }

async function fetchJson($: EngineInterface, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Fetched> {
  try {
    const { status, text } = await $.http.fetch(url, init)

    return { status, text }
  } catch (error) {
    note($, `fetch ${url} failed: ${String(error)}`)

    return { status: 0, text: '' }
  }
}

function parseJson(text: string): Reply | null {
  try {
    const value = JSON.parse(text) as unknown

    return typeof value === 'object' && value !== null ? (value as Reply) : null
  } catch {
    return null
  }
}

/** The Buddy server this Mac talks to: `SPROUT_BUDDY_SERVER` in the environment, else the one `/sprout server` set, else production. */
export async function buddyServer($: EngineInterface) {
  const fromEnv = normalizeServer(await $.env.get('SPROUT_BUDDY_SERVER'))
  if (fromEnv !== null) return fromEnv
  try {
    const stored = normalizeServer(await $.store.get(STORE.server))
    if (stored !== null) return stored
  } catch {}

  return BUDDY_DEFAULT_SERVER
}

/** Sets or clears the server override. A link to another server is dropped, as its machine id means nothing to the new one. */
export async function setBuddyServer($: EngineInterface, value: string | null) {
  const server = normalizeServer(value)
  if (value !== null && server === null) return null
  if (server === null) await $.store.delete(STORE.server)
  else await $.store.set(STORE.server, server)
  const current = await buddyServer($)
  const buddy = await read($, buddyState)
  if (buddy.link !== null && buddy.link.server !== current) await forgetLink($)

  return current
}

async function forgetLink($: EngineInterface) {
  stopBuddy()
  for (const key of [STORE.link, STORE.upload, STORE.others]) {
    try {
      await $.store.delete(key)
    } catch {}
  }
  await update($, othersState, () => null)
  await patch($, { link: null, connect: null, upload: null, error: null, note: null })
}

export async function hydrateBuddy($: EngineInterface, now: number) {
  const [link, upload, others, offer] = await Promise.all([
    $.store.get(STORE.link),
    $.store.get(STORE.upload),
    $.store.get(STORE.others),
    $.store.get(STORE.offer),
  ])
  const isReady = (await $.fs.exists(SECURITY)) && (await findNode($, now)) !== null
  const current = await read($, buddyState)
  await patch($, {
    isReady,
    link: isLink(link) ? link : null,
    upload: isUpload(upload) ? upload : null,
    isOfferHidden: offer === 'hidden',
    connect: current.connect !== null && current.connect.expiresAt > now ? current.connect : null,
  })
  if (isOthers(others) && (await read($, othersState)) === null) await update($, othersState, () => others)
  if (current.connect !== null && current.connect.expiresAt > now) startPolling($, current.connect)
}

async function macName($: EngineInterface) {
  for (const argv of [['/usr/sbin/scutil', '--get', 'ComputerName'], ['/bin/hostname', '-s']]) {
    try {
      const result = await $.process.run(argv, { timeoutMs: 5000 })
      if (result.exitCode === 0) return machineName(result.stdout)
    } catch {}
  }

  return machineName(null)
}

/** Asks Buddy to connect this Mac: its public key goes up, the browser opens the page where the person confirms, and the mod polls for the answer. */
export async function startConnect($: EngineInterface) {
  const buddy = await read($, buddyState)
  if (buddy.connect !== null || buddy.link !== null) return
  const key = await script($, ['key'])
  const publicKey = key?.publicKey
  if (typeof publicKey !== 'string') {
    await patch($, { note: key?.error === 'no-keychain' ? t('这台电脑没有钥匙串，先不同步', 'No Keychain on this computer, so no sync') : t('拿不到这台 Mac 的钥匙', "Can't get this Mac's key") })
    return
  }
  const server = await buddyServer($)
  const name = await macName($)
  const reply = await fetchJson($, `${server}/api/v1/connect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey, name }),
  })
  const body = parseJson(reply.text)
  const now = await $.clock.now()
  if (reply.status !== 200 || body === null || typeof body.requestId !== 'string' || typeof body.code !== 'string' || typeof body.url !== 'string') {
    await patch($, { note: reply.status === 429 ? t('试得太勤了，过几分钟再来', 'Too many tries. Try again in a few minutes') : t('暂时连不上 Buddy', "Can't reach Buddy right now") })
    return
  }
  const connect: SproutConnect = {
    server,
    requestId: body.requestId,
    code: body.code,
    url: body.url,
    expiresAt: now + Math.min(CONNECT_TIMEOUT_MS, (typeof body.expiresIn === 'number' ? body.expiresIn : 600) * 1000),
    intervalMs: Math.max(2000, (typeof body.interval === 'number' ? body.interval : 5) * 1000),
  }
  await patch($, { connect, note: null, error: null })
  try {
    await $.process.run([OPEN, connect.url], { timeoutMs: 5000 })
  } catch {}
  startPolling($, connect)
}

function startPolling($: EngineInterface, connect: SproutConnect) {
  stopBuddy()
  pollTimer = $.clock.every(connect.intervalMs, () => void pollConnect($).catch(error => note($, `connect poll failed: ${String(error)}`)))
}

export async function cancelConnect($: EngineInterface) {
  stopBuddy()
  await patch($, { connect: null, note: null })
}

/** One look at the connect request: pending keeps polling; approved saves the link and uploads at once; anything else ends it. */
export async function pollConnect($: EngineInterface) {
  const { connect } = await read($, buddyState)
  if (connect === null) {
    stopBuddy()
    return
  }
  const now = await $.clock.now()
  if (now > connect.expiresAt) {
    stopBuddy()
    await patch($, { connect: null, note: t('没在 10 分钟内确认，再试一次吧', 'Not confirmed within 10 minutes. Try again') })
    return
  }
  const reply = await fetchJson($, `${connect.server}/api/v1/connect/${connect.requestId}`)
  if (reply.status !== 200) return
  const body = parseJson(reply.text)
  const status = body?.status
  if (status === 'pending') return
  stopBuddy()
  if (status === 'approved') {
    const machine = (body?.machine as { id?: unknown; name?: unknown } | undefined) ?? {}
    if (typeof body?.user !== 'string' || typeof machine.id !== 'string') {
      await patch($, { connect: null, note: t('暂时连不上 Buddy', "Can't reach Buddy right now") })
      return
    }
    const link: SproutBuddyLink = {
      server: connect.server,
      user: body.user,
      machine: machine.id,
      name: typeof machine.name === 'string' ? machine.name : '',
      connectedAt: now,
    }
    await $.store.set(STORE.link, link)
    await $.store.delete(STORE.upload)
    await patch($, { connect: null, link, upload: null, error: null, note: null })
    try {
      $.ui.toast(t('连上了，手机上也能看到小苗了', 'Connected. Now you can see Miao on your phone too'))
    } catch {}
    await syncBuddy($, true)
    await pullOthers($, true)
    return
  }
  await patch($, { connect: null, note: status === 'denied' ? t('你在网页上拒绝了', 'You declined on the web page') : t('这次连接过期了，再试一次吧', 'This connect request expired. Try again') })
}

async function signed($: EngineInterface, link: SproutBuddyLink, command: 'sign-upload' | 'sign-read', extra: string[], stdin?: string) {
  const reply = await script($, [command, '--user', link.user, '--machine', link.machine, ...extra], stdin)
  const signature = reply?.signature

  return typeof signature === 'string' ? signature : null
}

/** Drops the link but keeps the key, then connects again: Buddy gives the same key its old machine id unless the person removed it there. */
export async function reconnectBuddy($: EngineInterface) {
  await forgetLink($)
  await startConnect($)
}

/** Uploads this Mac's state when it is due: at most every 5 minutes per Mac, only when the data changed; `isForced` skips that rule. */
export async function syncBuddy($: EngineInterface, isForced = false) {
  if (isUploading) return
  isUploading = true
  try {
    const buddy = await read($, buddyState)
    const link = buddy.link
    if (link === null || buddy.isReady !== true) return
    const now = await $.clock.now()
    const env = await read($, envState)
    const body = uploadBodyOf({
      at: now,
      tzOffsetMin: env.tzOffsetMin ?? -new Date().getTimezoneOffset(),
      scan: await read($, scanState),
      quota: await read($, quotaState),
      github: await read($, githubState),
      merges: await read($, mergesState),
      party: await read($, partyState),
      growth: await read($, growthState),
      pet: await read($, petState),
    })
    const hash = uploadHashOf(body)
    const stored = await $.store.get(STORE.upload)
    const last = isUpload(stored) ? stored : null
    if (!isForced && !shouldUpload(last, now, hash)) {
      if (JSON.stringify(last) !== JSON.stringify(buddy.upload)) await patch($, { upload: last })
      return
    }
    const text = JSON.stringify(body)
    const signature = await signed($, link, 'sign-upload', [], text)
    if (signature === null) return
    const reply = await fetchJson($, `${link.server}/api/v1/u/${link.user}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Buddy-Machine': link.machine, 'Buddy-Signature': signature },
      body: text,
    })
    if (reply.status === 200) {
      const upload: SproutUpload = { at: now, hash }
      await $.store.set(STORE.upload, upload)
      await patch($, { upload, error: null })
    } else if (reply.status === 401) {
      await patch($, { error: 'unauthorized' })
    } else {
      note($, `upload answered ${reply.status}: ${reply.text.slice(0, 200)}`)
      await patch($, { error: 'network' })
    }
  } finally {
    isUploading = false
  }
}

/** Pulls what the account's other Macs uploaded, once an hour, so that the pane shows every Mac's total. */
export async function pullOthers($: EngineInterface, isForced = false) {
  const buddy = await read($, buddyState)
  const link = buddy.link
  if (link === null || buddy.isReady !== true) return
  const now = await $.clock.now()
  const current = await read($, othersState)
  if (!isForced && current !== null && now - current.fetchedAt < OTHERS_MS) return
  const signature = await signed($, link, 'sign-read', ['--at', String(now)])
  if (signature === null) return
  const reply = await fetchJson($, `${link.server}/api/v1/u/${link.user}/others`, {
    headers: { 'Buddy-Machine': link.machine, 'Buddy-Signature': signature, 'Buddy-At': String(now) },
  })
  if (reply.status === 401) {
    await patch($, { error: 'unauthorized' })
    return
  }
  if (reply.status !== 200) return
  const others = parseOthers(parseJson(reply.text), now)
  if (others === null) return
  await $.store.set(STORE.others, others)
  if (JSON.stringify(current) !== JSON.stringify(others)) await update($, othersState, () => others)
}

/**
 * Forgets the link and keeps this Mac's key, so that a later connect gets the same machine id and Buddy does not count this Mac's days twice.
 * Buddy still lists the Mac, and counts its days, until the person removes it there.
 */
export async function disconnectBuddy($: EngineInterface) {
  await forgetLink($)
}

export async function hideOffer($: EngineInterface, isHidden: boolean) {
  if (isHidden) await $.store.set(STORE.offer, 'hidden')
  else await $.store.delete(STORE.offer)
  await patch($, { isOfferHidden: isHidden })
}
