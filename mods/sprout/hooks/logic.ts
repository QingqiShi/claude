import type { SproutBucket, SproutDay, SproutLimit, SproutMergeChunk, SproutMergeDay, SproutRange, SproutSample } from '../types'
import { t } from './i18n'
import { LEVELS, MAX_LEVEL, levelInfo } from './levels'

export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

export const FIVE_HOUR = { windowMs: 5 * HOUR_MS, lookbackMs: HOUR_MS }
export const SEVEN_DAY = { windowMs: 7 * DAY_MS, lookbackMs: 24 * HOUR_MS }

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type LocalTime = {
  year: number
  month: number
  date: number
  hour: number
  minute: number
  weekday: number
  day: string
}

export function localTime(ms: number, tzOffsetMin: number): LocalTime {
  const d = new Date(ms + tzOffsetMin * MINUTE_MS)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const date = d.getUTCDate()

  return {
    year,
    month,
    date,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    day: `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`,
  }
}

export function dayNumber(day: string) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
}

export function dayFromNumber(n: number) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export function addDays(day: string, n: number) {
  return dayFromNumber(dayNumber(day) + n)
}

/** Monday is 0. */
export function weekdayOf(day: string) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
}

export function clock(ms: number, tzOffsetMin: number) {
  const local = localTime(ms, tzOffsetMin)

  return `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`
}

export function weekdayClock(ms: number, tzOffsetMin: number) {
  const local = localTime(ms, tzOffsetMin)

  return `${t(WEEKDAYS[local.weekday]!, WEEKDAYS_EN[local.weekday]!)} ${clock(ms, tzOffsetMin)}`
}

export function monthLabel(month: number, gap = ' ') {
  return t(`${month}${gap}月`, MONTHS_EN[month - 1] ?? '')
}

export function whenText(ms: number, now: number, tzOffsetMin: number) {
  const isToday = localTime(ms, tzOffsetMin).day === localTime(now, tzOffsetMin).day

  return isToday ? clock(ms, tzOffsetMin) : weekdayClock(ms, tzOffsetMin)
}

export function untilText(ms: number, now: number) {
  const minutes = Math.max(0, Math.round((ms - now) / MINUTE_MS))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return t(`${m} 分`, `${m}m`)
  if (m === 0) return t(`${h} 小时`, `${h}h`)

  return t(`${h} 小时 ${m} 分`, `${h}h ${m}m`)
}

export function agoText(ms: number, now: number) {
  const minutes = Math.max(0, Math.round((now - ms) / MINUTE_MS))
  if (minutes < 60) return t(`${Math.max(1, minutes)} 分钟前`, `${Math.max(1, minutes)}m ago`)
  const hours = Math.round(minutes / 60)
  if (hours < 48) return t(`${hours} 小时前`, `${hours}h ago`)

  return t(`${Math.round(hours / 24)} 天前`, `${Math.round(hours / 24)}d ago`)
}

export function streakOf(activeDays: readonly string[], today: string) {
  const active = new Set(activeDays)
  let day = active.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (active.has(day)) {
    streak += 1
    day = addDays(day, -1)
  }

  return streak
}

export const PIPS = 7
const LOST_LOOKBACK_DAYS = 6

/** The streak that ended, when it ran more than 3 days and the current streak is 0 or 1. */
export function lostStreakOf(activeDays: readonly string[], today: string) {
  const active = new Set(activeDays)
  const streak = streakOf(activeDays, today)
  if (streak > 1) return null
  let day = streak === 1 && !active.has(today) ? addDays(today, -2) : addDays(today, -1)
  for (let i = 0; i < LOST_LOOKBACK_DAYS && !active.has(day); i++) day = addDays(day, -1)
  const lost = streakOf(activeDays, addDays(day, 1))

  return lost > 3 ? lost : null
}

export function levelForTokens(tokens: number) {
  let lv = 1
  for (const level of LEVELS) if (tokens >= level.thresholdB * 1e9) lv = level.lv

  return lv
}

/** Filled pips, rounded down, for the way from this level's threshold to the next. */
export function pipsFor(level: number, tokens: number) {
  if (level >= MAX_LEVEL) return PIPS
  const from = levelInfo(level).thresholdB * 1e9
  const to = levelInfo(level + 1).thresholdB * 1e9
  const share = Math.min(1, Math.max(0, (tokens - from) / (to - from)))

  return Math.min(PIPS, Math.floor(share * PIPS))
}

/** `stored` is the highest level kept so far, or null on the first run, which records the level without a level-up. */
export function growthStep(stored: number | null, tokens: number) {
  const level = levelForTokens(tokens)
  if (stored === null) return { highest: level, isLevelUp: false }
  if (level > stored) return { highest: level, isLevelUp: true }

  return { highest: stored, isLevelUp: false }
}

/** `seen` keeps, for each kind drawn so far, the data its entrance played with, or null once it draws without one. `played` is the day each kind last played it in any session. */
export function introStep<K extends string>(
  seen: Map<K, string | null>,
  drawings: Partial<Record<K, string | null>>,
  played: Partial<Record<K, string>>,
  today: string,
) {
  const intro = new Set<K>()
  const started: K[] = []
  for (const kind of Object.keys(drawings) as K[]) {
    const data = drawings[kind]
    if (data === null || data === undefined) continue
    if (!seen.has(kind)) {
      const isFirstToday = played[kind] !== today
      seen.set(kind, isFirstToday ? data : null)
      if (isFirstToday) started.push(kind)
    } else if (seen.get(kind) !== data) {
      seen.set(kind, null)
    }
    if (seen.get(kind) === data) intro.add(kind)
  }

  return { intro, started }
}

export type Forecast = {
  projected: number
  fullAt: number | null
  basis: 'recent' | 'average'
}

export function forecast(
  samples: readonly { at: number; pct: number }[],
  reading: { pct: number; at: number; resetsAt: number },
  window: { windowMs: number; lookbackMs: number },
): Forecast {
  const start = reading.resetsAt - window.windowMs
  const from = Math.max(start, reading.at - window.lookbackMs)
  const points = samples
    .filter(s => s.at >= from && s.at <= reading.at)
    .concat(samples.some(s => s.at === reading.at) ? [] : [{ at: reading.at, pct: reading.pct }])
    .sort((a, b) => a.at - b.at)
  const first = points[0]
  const last = points.at(-1)
  let rate: number
  let basis: Forecast['basis']
  if (first && last && last.at - first.at >= window.lookbackMs / 4) {
    rate = Math.max(0, (last.pct - first.pct) / (last.at - first.at))
    basis = 'recent'
  } else {
    const elapsed = reading.at - start
    rate = elapsed > MINUTE_MS ? Math.max(0, reading.pct / elapsed) : 0
    basis = 'average'
  }
  const left = Math.max(0, reading.resetsAt - reading.at)
  const projected = reading.pct + rate * left
  let fullAt: number | null = null
  if (reading.pct >= 100) fullAt = reading.at
  else if (projected > 100 && rate > 0) fullAt = reading.at + (100 - reading.pct) / rate

  return { projected, fullAt, basis }
}

export function samplesOf(samples: readonly SproutSample[], kind: 'five' | 'week') {
  const out: { at: number; pct: number }[] = []
  for (const s of samples) {
    const pct = s[kind]
    if (pct !== undefined) out.push({ at: s.at, pct })
  }

  return out
}

export type Mood = 'sleep' | 'party' | 'worry' | 'happy'

export type MoodInput = {
  five: number | null
  week: number | null
  isOverForecast: boolean
  isCelebrating: boolean
}

export function moodOf(input: MoodInput): Mood {
  if (input.five !== null && input.five >= 100) return 'sleep'
  if (input.isCelebrating) return 'party'
  const isTight =
    input.isOverForecast || (input.five !== null && input.five >= 85) || (input.week !== null && input.week >= 90)
  if (isTight) return 'worry'

  return 'happy'
}

export function bucketsFor(
  mood: Mood,
  hour: number,
  streak: number,
  extra: { isLevelUp: boolean; lost: number | null },
): SproutBucket[] {
  if (mood === 'party' && extra.isLevelUp) return ['levelup']
  if (mood !== 'happy') return [mood]
  if (hour < 5) return ['night']
  if (extra.lost !== null) return ['broken']
  if (streak >= 7) return ['happy', 'streak']

  return ['happy']
}

export function liveLimit(limit: SproutLimit | null, now: number): SproutLimit | null {
  if (limit === null) return null
  if (limit.resetsAt !== null && limit.resetsAt <= now) return { pct: 0, resetsAt: null }

  return limit
}

export function formatTokens(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`

  return String(Math.round(n))
}

export function formatUsd(usd: number) {
  if (usd < 10) return `$${usd.toFixed(2)}`

  return `$${withCommas(usd)}`
}

export function formatLines(n: number) {
  if (n >= 999_500) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 9_950) return `${Math.round(n / 1e3)}k`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`

  return String(Math.round(n))
}

export function withCommas(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function dayTotals(days: readonly SproutDay[]) {
  const map = new Map<string, SproutDay>()
  for (const d of days) map.set(d.day, d)

  return map
}

export function calendar(days: readonly SproutDay[], from: string, to: string): SproutDay[] {
  const map = dayTotals(days)
  const out: SproutDay[] = []
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const day = dayFromNumber(n)
    out.push(map.get(day) ?? { day, tokens: 0, costUsd: 0 })
  }

  return out
}

export function mergeCalendar(days: readonly SproutMergeDay[], from: string, to: string): SproutMergeDay[] {
  const map = new Map(days.map(d => [d.day, d]))
  const out: SproutMergeDay[] = []
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const day = dayFromNumber(n)
    out.push(map.get(day) ?? { day, prs: 0, additions: 0, deletions: 0 })
  }

  return out
}

export function mergeTotals(days: readonly SproutMergeDay[]) {
  return days.reduce((sum, d) => ({ prs: sum.prs + d.prs, additions: sum.additions + d.additions, deletions: sum.deletions + d.deletions }), {
    prs: 0,
    additions: 0,
    deletions: 0,
  })
}

export const RECENT_DAYS = 30
export const MERGE_CHUNK_DAYS = 14

/** The first day a range shows: the last 30 days, or every day since the first day with Claude data. */
export function rangeFrom(range: SproutRange, today: string, firstDay: string | null) {
  const recent = addDays(today, -(RECENT_DAYS - 1))

  return range === 'all' && firstDay !== null ? firstDay : recent
}

/** A day of a scan stored before the cache counts were kept makes the hit rate of a range unknown, so it falls back to the all-time rate. */
export function rangeTotals(days: readonly SproutDay[], from: string, fallbackHitRate: number) {
  let tokens = 0
  let costUsd = 0
  let cacheRead = 0
  let promptTokens = 0
  let isKnown = true
  for (const d of days) {
    if (d.day < from) continue
    tokens += d.tokens
    costUsd += d.costUsd
    if (d.cacheRead === undefined || d.promptTokens === undefined) isKnown = false
    else {
      cacheRead += d.cacheRead
      promptTokens += d.promptTokens
    }
  }
  const cacheHitRate = !isKnown ? fallbackHitRate : promptTokens > 0 ? cacheRead / promptTokens : 0

  return { tokens, costUsd, cacheHitRate }
}

export type ChunkSpan = { from: string; to: string }

/** Fixed 14-day blocks, newest first, so that a chunk keeps its bounds from one day to the next. */
export function chunksOf(start: string, today: string): ChunkSpan[] {
  const out: ChunkSpan[] = []
  const first = Math.floor(dayNumber(start) / MERGE_CHUNK_DAYS)
  for (let k = Math.floor(dayNumber(today) / MERGE_CHUNK_DAYS); k >= first; k--) {
    out.push({ from: dayFromNumber(k * MERGE_CHUNK_DAYS), to: dayFromNumber(k * MERGE_CHUNK_DAYS + MERGE_CHUNK_DAYS - 1) })
  }

  return out
}

/**
 * The chunks to fetch, newest first: each one never fetched, each one in the last 30 days when a refresh is due,
 * and each older one last fetched before the day after its end was over, as a merge late on its last day can be missing.
 */
export function planMergeChunks(start: string, today: string, stored: readonly SproutMergeChunk[], isDue: boolean): ChunkSpan[] {
  const recent = addDays(today, -(RECENT_DAYS - 1))
  const byFrom = new Map(stored.map(c => [c.from, c]))

  return chunksOf(start, today).filter(chunk => {
    const old = byFrom.get(chunk.from)
    if (old === undefined || old.to !== chunk.to) return true
    if (chunk.to >= recent) return isDue

    return old.asOf <= addDays(chunk.to, 1)
  })
}

/** The first day of the unbroken run of chunks that ends at the newest one. */
export function mergedFrom(chunks: readonly SproutMergeChunk[]): string | null {
  const sorted = [...chunks].sort((a, b) => b.from.localeCompare(a.from))
  let from: string | null = null
  for (const chunk of sorted) {
    if (from !== null && chunk.to !== addDays(from, -1)) break
    from = chunk.from
  }

  return from
}

const NO_LINE_START = new Set('，。、？！；：…）」』”’,.?!;:)'.split(''))

function unitsOf(ch: string) {
  const code = ch.codePointAt(0) ?? 0
  if (ch === ' ') return 0.3
  if (code < 0x2e80) return 0.56

  return 1
}

export function wrapText(text: string, maxUnits: number, maxLines: number, measure: (ch: string) => number = unitsOf) {
  const tokens = text.match(/[A-Za-z0-9_#$%.,:+\-/@'"`]+|\s|./gu) ?? []
  const rows: string[] = []
  let row = ''
  let units = 0
  for (const token of tokens) {
    const w = [...token].reduce((sum, ch) => sum + measure(ch), 0)
    const isMark = NO_LINE_START.has(token)
    if (units + w > maxUnits && row.trim() !== '' && !isMark) {
      rows.push(row.trimEnd())
      row = token === ' ' ? '' : token
      units = token === ' ' ? 0 : w
    } else {
      row += token
      units += w
    }
  }
  if (row.trim() !== '') rows.push(row.trimEnd())
  if (rows.length <= maxLines) return { rows, isCut: false }
  const kept = rows.slice(0, maxLines)
  kept[maxLines - 1] = `${[...(kept[maxLines - 1] ?? '')].slice(0, -1).join('')}…`

  return { rows: kept, isCut: true }
}

export function hashOf(...parts: Array<string | number>) {
  let hash = 0
  for (const ch of parts.join('|')) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0

  return (hash >>> 0).toString(36)
}
