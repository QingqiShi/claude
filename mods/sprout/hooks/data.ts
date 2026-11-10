import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionRateLimit } from 'claude-code'

import type {
  SproutGithub,
  SproutLevelUp,
  SproutLimit,
  SproutMergeChunk,
  SproutMergeDay,
  SproutMerges,
  SproutParty,
  SproutQuota,
  SproutSample,
  SproutScan,
} from '../types'
import type { ChunkSpan } from './logic'
import { withOthers } from './buddy'
import { DAY_MS, HOUR_MS, MINUTE_MS, RECENT_DAYS, addDays, growthStep, localTime, mergedFrom, planMergeChunks } from './logic'
import { hydrateBuddy, pollVisitors, pullOthers, stopBuddy, syncBuddy } from './sync'
import type { Host } from './host'
import { claude } from './host'
import { findGh, findNode, homeDir, note } from './tools'

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
const othersState = atom({ plugin: 'sprout', key: 'others' } as const, null, { shape: 'others-1' })

const POLL_MS = 5 * MINUTE_MS
const CALENDAR_MS = 6 * HOUR_MS
const MERGES_MS = 30 * MINUTE_MS
const MERGE_PAGES = 10
export const PARTY_MS = 10 * MINUTE_MS
const SAMPLE_KEEP_MS = 8 * DAY_MS
const SAMPLE_CAP = 1500
const SCAN_TIMEOUT_MS = 9 * MINUTE_MS

let isScanning = false
let quotaSavedAt = 0
let timers: Array<{ cancel: () => void }> = []

async function graphql($: EngineInterface, query: string): Promise<unknown> {
  const now = await $.clock.now()
  const path = await findGh($, now)
  if (path === null) return null
  try {
    const result = await $.process.run([path, 'api', 'graphql', '-f', `query=${query}`], { timeoutMs: 30_000 })
    if (result.exitCode !== 0) return null
    return JSON.parse(result.stdout) as unknown
  } catch {
    return null
  }
}

type RawScan = {
  version?: number
  firstDay?: string | null
  days?: Array<{ day?: string; input?: number; output?: number; cacheRead?: number; cacheWrite?: number; costUsd?: number }>
  totals?: { tokens?: number; costUsd?: number; cacheHitRate?: number }
}

export function parseScan(stdout: string, ranAt: number): SproutScan | null {
  const line = stdout.trim().split('\n').at(-1)
  if (line === undefined || line === '') return null
  let raw: RawScan
  try {
    raw = JSON.parse(line) as RawScan
  } catch {
    return null
  }
  if (raw.version !== 1 || !Array.isArray(raw.days)) return null
  const days = raw.days
    .filter(d => typeof d.day === 'string')
    .map(d => ({
      day: d.day as string,
      tokens: (d.input ?? 0) + (d.output ?? 0) + (d.cacheRead ?? 0) + (d.cacheWrite ?? 0),
      costUsd: d.costUsd ?? 0,
      cacheRead: d.cacheRead ?? 0,
      promptTokens: (d.input ?? 0) + (d.cacheRead ?? 0) + (d.cacheWrite ?? 0),
    }))

  return {
    ranAt,
    firstDay: raw.firstDay ?? days[0]?.day ?? null,
    days,
    totals: {
      tokens: raw.totals?.tokens ?? days.reduce((sum, d) => sum + d.tokens, 0),
      costUsd: raw.totals?.costUsd ?? days.reduce((sum, d) => sum + d.costUsd, 0),
      cacheHitRate: raw.totals?.cacheHitRate ?? 0,
    },
    previous: null,
  }
}

async function claudeScanArgs($: EngineInterface, home: string) {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const script = `${$.plugin.root}/scripts/scan.mjs`
  if (!(await $.fs.exists(script))) return null
  const roots = [`${config}/projects`]
  try {
    const imports = await $.fs.list(`${config}/sprout-imports`)
    for (const entry of imports.filter(item => item.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = `${config}/sprout-imports/${entry.name}`
      roots.push((await $.fs.exists(`${dir}/projects`)) ? `${dir}/projects` : dir)
    }
  } catch {}

  return [script, ...roots.flatMap(root => ['--projects', root]), '--cache', `${config}/sprout-cache/scan.json`]
}

export async function runScan($: EngineInterface, host: Host = claude) {
  if (isScanning) return
  isScanning = true
  try {
    const now = await $.clock.now()
    const home = await homeDir($)
    if (home === null) return
    const argv = host.scanArgs ?? (await claudeScanArgs($, home))
    if (argv === null) return
    const path = await findNode($, now)
    if (path === null) return
    const result = await $.process.run([path, ...argv], { timeoutMs: SCAN_TIMEOUT_MS })
    if (result.exitCode !== 0) {
      note($, `scan exited ${result.exitCode}: ${result.stderr.slice(0, 300)}`)
      return
    }
    const scan = parseScan(result.stdout, await $.clock.now())
    if (scan === null) {
      note($, 'scan printed no usable result')
      return
    }
    const old = await read($, scanState)
    const isSame =
      old !== null && JSON.stringify([old.days, old.totals, old.firstDay]) === JSON.stringify([scan.days, scan.totals, scan.firstDay])
    if (!isSame) {
      await update($, scanState, previous => ({
        ...scan,
        previous: previous === null ? null : previous.totals,
      }))
    }
    await $.store.set('scan', scan)
  } catch (error) {
    note($, `scan failed: ${String(error)}`)
  } finally {
    isScanning = false
  }
}

function toLimit(limit: SessionRateLimit | undefined): SproutLimit | null {
  if (limit === undefined) return null
  const resetsAt = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)

  return { pct: limit.percentUsed, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt }
}

function mergeSamples(a: readonly SproutSample[], b: readonly SproutSample[], now: number) {
  const byAt = new Map<number, SproutSample>()
  for (const s of [...a, ...b]) byAt.set(s.at, { ...byAt.get(s.at), ...s })

  return [...byAt.values()]
    .filter(s => s.at >= now - SAMPLE_KEEP_MS)
    .sort((x, y) => x.at - y.at)
    .slice(-SAMPLE_CAP)
}

function isQuota(value: unknown): value is SproutQuota {
  return typeof value === 'object' && value !== null && Array.isArray((value as SproutQuota).samples)
}

async function syncQuota($: EngineInterface, now: number) {
  const stored = await $.store.get('quota')
  const theirs = isQuota(stored) ? stored : null
  const mine = await read($, quotaState)
  const isTheirsNewer = theirs !== null && (theirs.at ?? 0) > (mine.at ?? 0)
  const merged: SproutQuota = {
    at: isTheirsNewer ? theirs.at : mine.at,
    five: isTheirsNewer ? theirs.five : mine.five,
    week: isTheirsNewer ? theirs.week : mine.week,
    samples: mergeSamples(mine.samples, theirs?.samples ?? [], now),
  }
  await $.store.set('quota', merged)
  quotaSavedAt = now
  if (JSON.stringify(merged) !== JSON.stringify(mine)) await update($, quotaState, () => merged)
}

/** `readAt` is for a reading that is older than now, such as one a host finds in a log. */
export async function recordLimits($: EngineInterface, limits: readonly SessionRateLimit[], readAt?: number) {
  const five = toLimit(limits.find(limit => limit.kind === 'five_hour'))
  const week = toLimit(limits.find(limit => limit.kind === 'seven_day'))
  if (five === null && week === null) return
  const at = readAt ?? (await $.clock.now())
  const current = await read($, quotaState)
  if (current.at !== null && at < current.at) return
  const last = current.samples.at(-1)
  if (last !== undefined && last.five === five?.pct && last.week === week?.pct && current.at !== null && at - current.at < 2 * MINUTE_MS) return
  await update($, quotaState, quota => {
    const sample: SproutSample = { at }
    if (five !== null) sample.five = five.pct
    if (week !== null) sample.week = week.pct
    const previous = quota.samples.at(-1)
    const isRepeat = previous !== undefined && previous.five === sample.five && previous.week === sample.week && at - previous.at < 10 * MINUTE_MS

    return {
      at,
      five: five ?? quota.five,
      week: week ?? quota.week,
      samples: isRepeat ? quota.samples : mergeSamples(quota.samples, [sample], at),
    }
  })
  if (at - quotaSavedAt > MINUTE_MS) await syncQuota($, at)
}

const LEVEL: Record<string, string> = { NONE: '0', FIRST_QUARTILE: '1', SECOND_QUARTILE: '2', THIRD_QUARTILE: '3', FOURTH_QUARTILE: '4' }

type CalendarReply = {
  data?: {
    viewer?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions?: number
          weeks?: Array<{ contributionDays?: Array<{ date?: string; contributionLevel?: string }> }>
        }
      }
    }
  }
}

export function parseCalendar(reply: unknown, fetchedAt: number): SproutGithub | null {
  const calendar = (reply as CalendarReply | null)?.data?.viewer?.contributionsCollection?.contributionCalendar
  if (calendar?.weeks === undefined) return null
  const days = calendar.weeks.flatMap(week => week.contributionDays ?? [])
  const start = days[0]?.date
  if (start === undefined) return null

  return {
    fetchedAt,
    total: calendar.totalContributions ?? 0,
    start,
    levels: days.map(day => LEVEL[day.contributionLevel ?? 'NONE'] ?? '0').join(''),
  }
}

async function refreshCalendar($: EngineInterface, now: number) {
  const current = await read($, githubState)
  if (current !== null && now - current.fetchedAt < CALENDAR_MS) return
  const reply = await graphql(
    $,
    'query{viewer{contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionLevel}}}}}}',
  )
  const calendar = parseCalendar(reply, now)
  if (calendar === null) return
  await update($, githubState, () => calendar)
  await $.store.set('github', calendar)
}

type SearchReply = {
  data?: { search?: { nodes?: Array<{ number?: number; title?: string; mergedAt?: string; repository?: { nameWithOwner?: string } }> } }
}

function isParty(value: unknown): value is SproutParty {
  return typeof value === 'object' && value !== null && typeof (value as SproutParty).until === 'number'
}

async function pollMerges($: EngineInterface, now: number): Promise<boolean> {
  const reply = (await graphql(
    $,
    'query{search(query:"author:@me is:pr is:merged sort:updated-desc",type:ISSUE,first:5){nodes{... on PullRequest{number title mergedAt repository{nameWithOwner}}}}}',
  )) as SearchReply | null
  const merged = (reply?.data?.search?.nodes ?? [])
    .map(pr => ({ ...pr, at: pr.mergedAt === undefined ? NaN : Date.parse(pr.mergedAt) }))
    .filter(pr => !Number.isNaN(pr.at) && typeof pr.number === 'number')
    .sort((a, b) => b.at - a.at)
  const newest = merged[0]
  const seen = Number((await $.store.get('lastMergeAt')) ?? 0)
  const isNew = newest !== undefined && newest.at > seen
  if (isNew) {
    await $.store.set('lastMergeAt', newest.at)
    const isFresh = seen === 0 ? now - newest.at < PARTY_MS : now - newest.at < 6 * HOUR_MS
    if (isFresh) {
      const party: SproutParty = {
        number: newest.number ?? 0,
        title: newest.title ?? '',
        repo: newest.repository?.nameWithOwner ?? '',
        until: now + PARTY_MS,
      }
      await $.store.set('party', party)
    }
  }
  const stored = await $.store.get('party')
  const party = isParty(stored) && stored.until > now ? stored : null
  const mine = await read($, partyState)
  if (JSON.stringify(mine) !== JSON.stringify(party)) {
    await update($, partyState, () => party)
    if (party !== null) $.clock.after(party.until - now + 500, () => $.ui.invalidate('ui.render'))
  }

  return isNew
}

type MergeNode = { mergedAt?: string; additions?: number; deletions?: number }

type MergePageReply = {
  data?: { search?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }; nodes?: MergeNode[] } }
}

export function mergePage(reply: unknown): { nodes: MergeNode[]; next: string | null } | null {
  const search = (reply as MergePageReply | null)?.data?.search
  if (search?.nodes === undefined) return null
  const next = search.pageInfo?.hasNextPage === true ? (search.pageInfo.endCursor ?? null) : null

  return { nodes: search.nodes, next }
}

export function mergeDays(nodes: readonly MergeNode[], tzOffsetMin: number, from: string, to = '9999-12-31'): SproutMergeDay[] {
  const byDay = new Map<string, SproutMergeDay>()
  for (const pr of nodes) {
    const at = pr.mergedAt === undefined ? NaN : Date.parse(pr.mergedAt)
    if (Number.isNaN(at)) continue
    const day = localTime(at, tzOffsetMin).day
    if (day < from || day > to) continue
    const row = byDay.get(day) ?? { day, prs: 0, additions: 0, deletions: 0 }
    byDay.set(day, {
      day,
      prs: row.prs + 1,
      additions: row.additions + Math.max(0, pr.additions ?? 0),
      deletions: row.deletions + Math.max(0, pr.deletions ?? 0),
    })
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

/** A value stored before merges were fetched in chunks has none, so every chunk is fetched again. */
export function asMerges(value: unknown): SproutMerges | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<SproutMerges>
  if (typeof v.fetchedAt !== 'number' || !Array.isArray(v.days)) return null

  return {
    fetchedAt: v.fetchedAt,
    from: typeof v.from === 'string' ? v.from : (v.days[0]?.day ?? ''),
    tzOffsetMin: typeof v.tzOffsetMin === 'number' ? v.tzOffsetMin : null,
    chunks: Array.isArray(v.chunks) ? v.chunks : [],
    days: v.days,
  }
}

function isSameMerges(a: SproutMerges | null, b: SproutMerges) {
  return a !== null && JSON.stringify([a.from, a.chunks, a.days]) === JSON.stringify([b.from, b.chunks, b.days])
}

/** One day either side of the chunk, as the search reads dates in UTC; mergeDays keeps the local days of the chunk. */
export function mergeQuery(chunk: ChunkSpan, after: string | null) {
  const cursor = after === null ? '' : `,after:${JSON.stringify(after)}`

  return `query{search(query:"author:@me is:pr is:merged merged:${addDays(chunk.from, -1)}..${addDays(chunk.to, 1)} sort:created-asc",type:ISSUE,first:100${cursor}){pageInfo{hasNextPage endCursor} nodes{... on PullRequest{mergedAt additions deletions}}}}`
}

/** Null when a page fails, so that a chunk is saved whole or not at all. */
export async function fetchChunk(ask: (query: string) => Promise<unknown>, chunk: ChunkSpan, tzOffsetMin: number) {
  const nodes: MergeNode[] = []
  let after: string | null = null
  for (let page = 0; page < MERGE_PAGES; page++) {
    const parsed = mergePage(await ask(mergeQuery(chunk, after)))
    if (parsed === null) return null
    nodes.push(...parsed.nodes)
    after = parsed.next
    if (after === null) break
  }

  return mergeDays(nodes, tzOffsetMin, chunk.from, chunk.to)
}

export function withChunk(merges: SproutMerges, chunk: SproutMergeChunk, fresh: readonly SproutMergeDay[]): SproutMerges {
  const chunks = [...merges.chunks.filter(c => c.from !== chunk.from), chunk].sort((a, b) => a.from.localeCompare(b.from))
  const days = [...merges.days.filter(d => d.day < chunk.from || d.day > chunk.to), ...fresh].sort((a, b) => a.day.localeCompare(b.day))

  return { ...merges, chunks, days, from: mergedFrom(chunks) ?? merges.from }
}

async function refreshMerges($: EngineInterface, now: number, isForced: boolean) {
  const theirs = asMerges(await $.store.get('merges'))
  let mine = await read($, mergesState)
  if (theirs !== null && theirs.fetchedAt > (mine?.fetchedAt ?? 0) && !isSameMerges(mine, theirs)) mine = await update($, mergesState, () => theirs)
  const env = await read($, envState)
  const tz = env.tzOffsetMin ?? -new Date().getTimezoneOffset()
  const today = localTime(now, tz).day
  const recent = addDays(today, -(RECENT_DAYS - 1))
  const firstDay = (await read($, scanState))?.firstDay ?? null
  const start = firstDay !== null && firstDay < recent ? firstDay : recent
  const kept: SproutMerges =
    mine !== null && mine.tzOffsetMin === tz ? mine : { fetchedAt: 0, from: recent, tzOffsetMin: tz, chunks: [], days: [] }
  const isDue = isForced || now - kept.fetchedAt >= MERGES_MS
  const plan = planMergeChunks(start, today, kept.chunks, isDue)
  if (plan.length === 0) return
  let merges = kept
  let isRecentFetched = isDue
  for (const chunk of plan) {
    const fresh = await fetchChunk(query => graphql($, query), chunk, tz)
    if (fresh === null) {
      if (chunk.to >= recent) isRecentFetched = false
      break
    }
    merges = withChunk(merges, { ...chunk, asOf: today }, fresh)
  }
  if (merges === kept) return
  if (isRecentFetched) merges = { ...merges, fetchedAt: now }
  if (!isSameMerges(await read($, mergesState), merges)) await update($, mergesState, () => merges)
  await $.store.set('merges', merges)
}

function isLevelUp(value: unknown): value is SproutLevelUp {
  return typeof value === 'object' && value !== null && typeof (value as SproutLevelUp).until === 'number'
}

async function syncGrowth($: EngineInterface, now: number) {
  const stored = await $.store.get('highestLevel')
  let highest = typeof stored === 'number' ? stored : null
  const scan = withOthers(await read($, scanState), await read($, othersState))
  if (scan !== null) {
    const step = growthStep(highest, scan.totals.tokens)
    if (step.highest !== highest) await $.store.set('highestLevel', step.highest)
    if (step.isLevelUp) await $.store.set('levelUp', { level: step.highest, until: now + PARTY_MS })
    highest = step.highest
  }
  const raw = await $.store.get('levelUp')
  const levelUp = isLevelUp(raw) && raw.until > now ? raw : null
  const next = { highest, levelUp }
  const mine = await read($, growthState)
  if (JSON.stringify(mine) !== JSON.stringify(next)) {
    await update($, growthState, () => next)
    if (levelUp !== null) $.clock.after(levelUp.until - now + 500, () => $.ui.invalidate('ui.render'))
  }
}

function parseOffset(text: string) {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(text.trim())
  if (match === null) return null
  const minutes = Number(match[2]) * 60 + Number(match[3])

  return match[1] === '-' ? -minutes : minutes
}

export function repoName(remote: string | null) {
  if (remote === null) return null
  const name = remote.replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).at(-1)

  return name === undefined || name === '' ? null : name
}

async function refreshEnv($: EngineInterface, cwd: string) {
  let tzOffsetMin: number | null = null
  try {
    const result = await $.process.run(['date', '+%z'], { timeoutMs: 5000 })
    if (result.exitCode === 0) tzOffsetMin = parseOffset(result.stdout)
  } catch {}
  if (tzOffsetMin === null) tzOffsetMin = -new Date().getTimezoneOffset()
  let repo: string | null = null
  try {
    const found = await $.session.repo()
    repo = repoName(found?.remote ?? null) ?? (found === null ? null : (found.root.split('/').at(-1) ?? null))
  } catch {}
  if (repo === null) repo = cwd.split('/').filter(Boolean).at(-1) ?? null
  const env = { repo, tzOffsetMin }
  const current = await read($, envState)
  if (JSON.stringify(current) !== JSON.stringify(env)) await update($, envState, () => env)
}

async function hydrate($: EngineInterface) {
  const scan = await $.store.get('scan')
  if ((await read($, scanState)) === null && typeof scan === 'object' && scan !== null && Array.isArray((scan as SproutScan).days)) {
    await update($, scanState, () => ({ ...(scan as SproutScan), previous: null }))
  }
  const github = await $.store.get('github')
  if ((await read($, githubState)) === null && typeof github === 'object' && github !== null && typeof (github as SproutGithub).levels === 'string') {
    await update($, githubState, () => github as SproutGithub)
  }
  const merges = asMerges(await $.store.get('merges'))
  if ((await read($, mergesState)) === null && merges !== null) await update($, mergesState, () => merges)
  const counters = (await $.store.get('counters')) as { fed?: number; patted?: number } | undefined
  if (counters !== undefined) {
    await update($, petState, pet => ({ ...pet, fed: Math.max(pet.fed, counters.fed ?? 0), patted: Math.max(pet.patted, counters.patted ?? 0) }))
  }
}

async function safely($: EngineInterface, what: string, work: () => Promise<void>) {
  try {
    await work()
  } catch (error) {
    note($, `${what} failed: ${String(error)}`)
  }
}

export function stopSprout() {
  for (const timer of timers) timer.cancel()
  timers = []
  stopBuddy()
}

export function startSprout($: EngineInterface, cwd: string, host: Host = claude) {
  stopSprout()
  const cycle = async (isFirst: boolean) => {
    const now = await $.clock.now()
    await safely($, 'usage', () => syncQuota($, now))
    if (isFirst) await safely($, 'env', () => refreshEnv($, cwd))
    let isNewMerge = false
    await safely($, 'merges', async () => {
      isNewMerge = await pollMerges($, now)
    })
    await safely($, 'merge days', () => refreshMerges($, now, isNewMerge))
    await safely($, 'calendar', () => refreshCalendar($, now))
    await safely($, 'growth', () => syncGrowth($, now))
    await runScan($, host)
    await safely($, 'buddy others', () => pullOthers($))
    await safely($, 'growth', async () => syncGrowth($, await $.clock.now()))
    await safely($, 'buddy upload', () => syncBuddy($))
    await safely($, 'buddy visitors', () => pollVisitors($))
  }
  void (async () => {
    await safely($, 'hydrate', () => hydrate($))
    await safely($, 'buddy', async () => hydrateBuddy($, await $.clock.now()))
    await cycle(true)
  })()
  timers.push($.clock.every(POLL_MS, () => void cycle(false)))
  timers.push($.clock.every(30 * MINUTE_MS, () => void safely($, 'env', () => refreshEnv($, cwd))))
  timers.push($.clock.every(MINUTE_MS, () => $.ui.invalidate('ui.render')))
}
