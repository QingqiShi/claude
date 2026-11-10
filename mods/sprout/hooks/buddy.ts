import type {
  SproutDay,
  SproutGithub,
  SproutGrowth,
  SproutMerges,
  SproutOthers,
  SproutParty,
  SproutPet,
  SproutQuota,
  SproutScan,
  SproutUpload,
  SproutVisitorCounts,
} from '../types'
import { MINUTE_MS, hashOf } from './logic'

export const BUDDY_DEFAULT_SERVER = 'https://buddy.qingqi.dev'
export const UPLOAD_EVERY_MS = 5 * MINUTE_MS
export const VISITORS_EVERY_MS = 15 * MINUTE_MS
const MAX_DAYS = 4000
const MAX_SAMPLES = 2000
const MAX_NAME = 64
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

/**
 * The body of `POST /api/v1/u/[user]/upload`, as Buddy's strict schema takes it. Every field a Mac sends is listed
 * here, so what is not (the repository name, a PR's title and repository, the merge chunks) never leaves the Mac.
 */
export type UploadBody = {
  v: 1
  at: number
  tzOffsetMin: number
  firstDay: string | null
  days: SproutDay[]
  quota: SproutQuota | null
  github: SproutGithub | null
  merges: { from: string; days: SproutMerges['days'] } | null
  party: { number: number; until: number } | null
  growth: SproutGrowth
  pet: { fed: number; patted: number }
}

export type UploadInput = {
  at: number
  tzOffsetMin: number
  scan: SproutScan | null
  quota: SproutQuota
  github: SproutGithub | null
  merges: SproutMerges | null
  party: SproutParty | null
  growth: SproutGrowth
  pet: SproutPet
}

const whole = (n: number) => Math.max(0, Math.round(n))
const dayOrNull = (day: string | null) => (day !== null && DAY.test(day) ? day : null)

function dayOf(d: SproutDay): SproutDay {
  const out: SproutDay = { day: d.day, tokens: whole(d.tokens), costUsd: Math.max(0, d.costUsd) }
  if (d.cacheRead !== undefined) out.cacheRead = whole(d.cacheRead)
  if (d.promptTokens !== undefined) out.promptTokens = whole(d.promptTokens)

  return out
}

export function uploadBodyOf(input: UploadInput): UploadBody {
  const { scan, quota, merges, party, growth } = input
  const days = (scan?.days ?? []).filter(d => DAY.test(d.day)).slice(-MAX_DAYS).map(dayOf)
  const limit = (l: SproutQuota['five']) =>
    l === null ? null : { pct: Math.max(0, l.pct), resetsAt: l.resetsAt === null ? null : whole(l.resetsAt) }
  const samples = quota.samples.slice(-MAX_SAMPLES).map(s => ({
    at: whole(s.at),
    ...(s.five === undefined ? {} : { five: s.five }),
    ...(s.week === undefined ? {} : { week: s.week }),
  }))
  const hasQuota = quota.at !== null || quota.five !== null || quota.week !== null || samples.length > 0

  return {
    v: 1,
    at: whole(input.at),
    tzOffsetMin: Math.max(-720, Math.min(840, Math.round(input.tzOffsetMin))),
    firstDay: dayOrNull(scan?.firstDay ?? null),
    days,
    quota: hasQuota ? { at: quota.at === null ? null : whole(quota.at), five: limit(quota.five), week: limit(quota.week), samples } : null,
    github:
      input.github === null
        ? null
        : {
            fetchedAt: whole(input.github.fetchedAt),
            total: whole(input.github.total),
            start: input.github.start,
            levels: input.github.levels.slice(0, MAX_DAYS),
          },
    merges:
      merges === null || !DAY.test(merges.from)
        ? null
        : {
            from: merges.from,
            days: merges.days
              .filter(d => DAY.test(d.day))
              .slice(-MAX_DAYS)
              .map(d => ({ day: d.day, prs: whole(d.prs), additions: whole(d.additions), deletions: whole(d.deletions) })),
          },
    party: party === null ? null : { number: whole(party.number), until: whole(party.until) },
    growth: {
      highest: growth.highest === null ? null : Math.min(1000, whole(growth.highest)),
      levelUp: growth.levelUp === null ? null : { level: Math.min(1000, whole(growth.levelUp.level)), until: whole(growth.levelUp.until) },
    },
    pet: { fed: whole(input.pet.fed), patted: whole(input.pet.patted) },
  }
}

/** The hash of what an upload says, without when it says it, so that two uploads of the same data compare equal. */
export function uploadHashOf(body: UploadBody) {
  const { at: _at, ...rest } = body

  return hashOf(JSON.stringify(rest))
}

/** One upload per Mac at most every 5 minutes, and only when the data changed since the last one. */
export function shouldUpload(last: SproutUpload | null, now: number, hash: string) {
  if (last === null) return true
  if (last.hash === hash) return false

  return now - last.at >= UPLOAD_EVERY_MS
}

/** A visitors read is due when this Mac has not heard from Buddy, by an upload or a read, for 15 minutes. */
export function isVisitorsDue(lastUpload: number | null, lastPoll: number | null, now: number) {
  const contact = Math.max(lastUpload ?? 0, lastPoll ?? 0)

  return now - contact >= VISITORS_EVERY_MS
}

/** The `visitors` counts of a Buddy reply, or null when the reply has none, as an older Buddy's does. */
export function parseVisitors(value: unknown): SproutVisitorCounts | null {
  const visitors = (value as { visitors?: unknown } | null)?.visitors
  if (typeof visitors !== 'object' || visitors === null) return null
  const { fed, patted } = visitors as { fed?: unknown; patted?: unknown }
  if (typeof fed !== 'number' || typeof patted !== 'number' || !Number.isFinite(fed) || !Number.isFinite(patted)) return null

  return { fed: whole(fed), patted: whole(patted) }
}

/** The scan with the other Macs' days added, day by day, so that the pane shows what every Mac spent. */
export function withOthers(scan: SproutScan | null, others: SproutOthers | null): SproutScan | null {
  if (others === null || others.days.length === 0) return scan
  const byDay = new Map<string, SproutDay>()
  for (const d of [...(scan?.days ?? []), ...others.days]) {
    const old = byDay.get(d.day)
    if (old === undefined) {
      byDay.set(d.day, { ...d })
      continue
    }
    const sum: SproutDay = { day: d.day, tokens: old.tokens + d.tokens, costUsd: old.costUsd + d.costUsd }
    if (old.cacheRead !== undefined && old.promptTokens !== undefined && d.cacheRead !== undefined && d.promptTokens !== undefined) {
      sum.cacheRead = old.cacheRead + d.cacheRead
      sum.promptTokens = old.promptTokens + d.promptTokens
    }
    byDay.set(d.day, sum)
  }
  const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  const firstDays = [scan?.firstDay ?? null, others.firstDay, days[0]?.day ?? null].filter((d): d is string => d !== null).sort()
  let cacheRead = 0
  let promptTokens = 0
  let isKnown = true
  for (const d of days) {
    if (d.cacheRead === undefined || d.promptTokens === undefined) isKnown = false
    else {
      cacheRead += d.cacheRead
      promptTokens += d.promptTokens
    }
  }
  const hitRate = isKnown && promptTokens > 0 ? cacheRead / promptTokens : (scan?.totals.cacheHitRate ?? 0)

  return {
    ranAt: scan?.ranAt ?? others.fetchedAt,
    firstDay: firstDays[0] ?? null,
    days,
    totals: { tokens: days.reduce((sum, d) => sum + d.tokens, 0), costUsd: days.reduce((sum, d) => sum + d.costUsd, 0), cacheHitRate: hitRate },
    previous: scan?.previous ?? null,
  }
}

/** The origin of a server URL, or null for anything that is not an http(s) URL. */
export function normalizeServer(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

    return url.origin
  } catch {
    return null
  }
}

/** The Mac's name as Buddy shows it: one line, no control characters, 64 characters at most. */
export function machineName(raw: string | null, fallback = 'Mac') {
  const name = (raw ?? '')
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)
    .trim()

  return name === '' ? fallback : name
}

export function parseOthers(value: unknown, fetchedAt: number): SproutOthers | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { firstDay?: unknown; days?: unknown }
  if (!Array.isArray(v.days)) return null
  const days = v.days
    .filter((d): d is SproutDay => typeof d === 'object' && d !== null && typeof (d as SproutDay).day === 'string' && typeof (d as SproutDay).tokens === 'number')
    .map(d => ({
      day: d.day,
      tokens: d.tokens,
      costUsd: typeof d.costUsd === 'number' ? d.costUsd : 0,
      ...(typeof d.cacheRead === 'number' ? { cacheRead: d.cacheRead } : {}),
      ...(typeof d.promptTokens === 'number' ? { promptTokens: d.promptTokens } : {}),
    }))

  return { fetchedAt, firstDay: typeof v.firstDay === 'string' ? v.firstDay : null, days }
}
