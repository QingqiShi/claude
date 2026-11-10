import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SproutBucket, SproutIntroKind, SproutIntroPlayed, SproutLimit, SproutPet, SproutRange } from '../types'
import { withOthers } from './buddy'
import type { Host } from './host'
import { claude } from './host'
import type { LineContext } from './lines'
import { isMood, linesFor } from './lines'
import type { Forecast, Mood } from './logic'
import {
  FEED_MS,
  FIVE_HOUR,
  MINUTE_MS,
  PAT_MS,
  SEVEN_DAY,
  addDays,
  bucketsFor,
  calendar,
  dayNumber,
  forecast,
  formatTokens,
  formatUsd,
  hashOf,
  introStep,
  liveLimit,
  localTime,
  mergeCalendar,
  mergeTotals,
  monthLabel,
  moodOf,
  levelForTokens,
  lostStreakOf,
  RECENT_DAYS,
  pipsFor,
  rangeFrom,
  rangeTotals,
  samplesOf,
  streakOf,
  untilText,
  weekdayClock,
  whenText,
  withCommas,
  wrapText,
} from './logic'
import { loadLang, t } from './i18n'
import { levelLabel } from './levels'
import { trendStats } from './panels'
import { BUBBLE_ROWS, BUBBLE_UNITS, sceneSvg } from './scene'
import { memoize } from './svg-kit'

// The engine reads state keys off each file's own source, so these atoms are written here and again in data.ts and register.tsx.
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
const rangeState = atom({ plugin: 'sprout', key: 'range' } as const, '30')
const envState = atom({ plugin: 'sprout', key: 'env' } as const, { repo: null, tzOffsetMin: null })
const growthState = atom({ plugin: 'sprout', key: 'growth' } as const, { highest: null, levelUp: null })
const buddyState = atom(
  { plugin: 'sprout', key: 'buddy' } as const,
  { isReady: null, link: null, connect: null, upload: null, error: null, note: null, isOfferHidden: false },
  { shape: 'buddy-1' },
)
const othersState = atom({ plugin: 'sprout', key: 'others' } as const, null, { shape: 'others-1' })
const visitorsState = atom({ plugin: 'sprout', key: 'visitors' } as const, null, { shape: 'visitors-1' })

const POP_MS = 1000
const LINE_FRESH_MS = 5 * MINUTE_MS
const AUTO_LINE_MS = 10 * MINUTE_MS
export const STALE_QUOTA_MS = 15 * MINUTE_MS
const CELL_PX = 7.2
const INTRO_KEY = 'introPlayed'
const introSeen = new Map<SproutIntroKind, string | null>()

/** On desktop a cell is the code font's advance, so the pane's pixel width is about the columns times that. */
export function contentWidth(columns: number) {
  return Math.max(312, Math.min(480, Math.round((columns * CELL_PX) / 4) * 4))
}

export type Window = {
  kind: 'five' | 'week'
  label: string
  quotaLabel: string
  limit: SproutLimit
  forecast: Forecast | null
}

export function title() {
  return t('小苗', 'Miao')
}

function poolFor(key: SproutBucket, streak: number): SproutBucket[] {
  return key === 'happy' && streak >= 7 ? ['happy', 'streak'] : [key]
}

export function resetText(window: Window, now: number, tz: number) {
  const at = window.limit.resetsAt
  if (at === null) return window.limit.pct === 0 ? t('已重置', 'Reset') : ''
  if (window.kind === 'five') return t(`${untilText(at, now)}后重置`, `Resets in ${untilText(at, now)}`)

  return t(`${weekdayClock(at, tz)} 重置`, `Resets ${weekdayClock(at, tz)}`)
}

export function forecastText(window: Window, now: number, tz: number) {
  const { limit } = window
  const fc = window.forecast
  if (limit.pct >= 100) {
    return limit.resetsAt === null ? t('已用完', 'Used up') : t(`已用完，${whenText(limit.resetsAt, now, tz)} 恢复`, `Used up, back at ${whenText(limit.resetsAt, now, tz)}`)
  }
  if (fc === null) return null
  const basis =
    window.kind === 'five'
      ? fc.basis === 'recent'
        ? t('按最近 1 小时的速度', "At the last hour's pace")
        : t('按这个窗口的平均速度', "At this window's average pace")
      : fc.basis === 'recent'
        ? t('按最近 24 小时的速度', "At the last 24 hours' pace")
        : t('按本周的平均速度', "At this week's average pace")
  if (fc.fullAt !== null) return t(`${basis}，${whenText(fc.fullAt, now, tz)} 左右就用完`, `${basis}, it runs out around ${whenText(fc.fullAt, now, tz)}`)
  const projected = Math.round(fc.projected)
  if (window.kind === 'five') return t(`${basis}，重置时约 ${projected}%`, `${basis}, about ${projected}% at reset`)

  return t(`${basis}，重置时还剩约 ${Math.max(0, 100 - projected)}%`, `${basis}, about ${Math.max(0, 100 - projected)}% left at reset`)
}

export async function readModel($: EngineInterface, host: Host = claude) {
  await loadLang($)
  const now = await $.clock.now()
  const env = await read($, envState)
  const tz = env.tzOffsetMin ?? -new Date().getTimezoneOffset()
  const local = localTime(now, tz)
  const today = local.day
  const scan = withOthers(await read($, scanState), await read($, othersState))
  const quota = await read($, quotaState)
  const github = await read($, githubState)
  const merges = await read($, mergesState)
  const party = await read($, partyState)
  const pet = await read($, petState)
  const range = await read($, rangeState)
  const growth = await read($, growthState)
  const buddy = await read($, buddyState)
  const visitors = await read($, visitorsState)
  const from = rangeFrom(range, today, scan?.firstDay ?? null)
  const mergeDays = merges === null ? [] : mergeCalendar(merges.days, merges.from > from ? merges.from : from, today)
  const totals = scan === null ? null : rangeTotals(scan.days, from, scan.totals.cacheHitRate)

  const active = (scan?.days ?? []).filter(d => d.tokens > 0).map(d => d.day)
  const streak = streakOf(active, today)
  const lost = lostStreakOf(active, today)
  const tokens = scan?.totals.tokens ?? 0
  const level = Math.max(growth.highest ?? 1, levelForTokens(tokens))
  const pips = pipsFor(level, tokens)

  const windows: Window[] = []
  const add = (kind: 'five' | 'week', label: string, quotaLabel: string, raw: SproutLimit | null) => {
    const limit = liveLimit(raw, now)
    if (limit === null) return
    const fc =
      limit.resetsAt === null || quota.at === null
        ? null
        : forecast(samplesOf(quota.samples, kind), { pct: limit.pct, at: quota.at, resetsAt: limit.resetsAt }, kind === 'five' ? FIVE_HOUR : SEVEN_DAY)
    windows.push({ kind, label, quotaLabel, limit, forecast: fc })
  }
  add('five', t('5 小时', '5 hours'), t('5 小时额度', '5-hour quota'), quota.five)
  add('week', t('本周', 'This week'), t('本周额度', 'Weekly quota'), quota.week)
  const fiveWindow = windows.find(w => w.kind === 'five')
  const weekWindow = windows.find(w => w.kind === 'week')

  const isParty = party !== null && party.until > now
  const isLevelUp = growth.levelUp !== null && growth.levelUp.until > now
  const action: 'feed' | 'pat' | null =
    pet.action === 'feed' && now - pet.actionAt < FEED_MS ? 'feed' : pet.action === 'pat' && now - pet.actionAt < PAT_MS ? 'pat' : null
  const mood: Mood = moodOf({
    five: fiveWindow?.limit.pct ?? null,
    week: weekWindow?.limit.pct ?? null,
    isOverForecast: windows.some(w => (w.forecast?.projected ?? 0) > 100),
    isCelebrating: isParty || isLevelUp || action === 'pat',
  })

  const todayEntry = scan?.days.find(d => d.day === today)
  const fullAt = windows
    .map(w => w.forecast?.fullAt ?? null)
    .filter((at): at is number => at !== null && at > now)
    .sort((a, b) => a - b)[0]
  const visitCount = pet.line?.count ?? 0
  const context: LineContext = {
    streak,
    lost,
    level: levelLabel(isLevelUp && growth.levelUp !== null ? growth.levelUp.level : level),
    total: scan === null ? null : formatUsd(scan.totals.costUsd),
    today: todayEntry === undefined || todayEntry.costUsd <= 0 ? null : formatUsd(todayEntry.costUsd),
    hit: scan === null || scan.totals.cacheHitRate <= 0 ? null : `${Math.round(scan.totals.cacheHitRate * 100)}%`,
    tokens: scan === null ? null : formatTokens(scan.totals.tokens),
    five: fiveWindow === undefined ? null : `${Math.round(fiveWindow.limit.pct)}%`,
    week: weekWindow === undefined ? null : `${Math.round(weekWindow.limit.pct)}%`,
    fullAt: fullAt === undefined ? null : whenText(fullAt, now, tz),
    reset: fiveWindow?.limit.resetsAt == null ? null : whenText(fiveWindow.limit.resetsAt, now, tz),
    pr: isParty ? `#${party.number}` : null,
    fed: pet.fed + (visitors?.fed ?? 0),
    patted: pet.patted + (visitors?.patted ?? 0),
    visits: visitCount >= 2 ? visitCount : null,
    time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    ...host.context?.(),
  }
  const hostBucket = host.bucketFor?.(mood, isParty || isLevelUp) ?? null
  const moodKey = hostBucket?.key ?? bucketsFor(mood, local.hour, streak, { isLevelUp, lost })[0] ?? 'happy'
  const line = pet.line
  const isLineLive =
    line !== null && now - line.at < LINE_FRESH_MS && (!isMood(line.bucket) || line.bucket === moodKey)
  const lineKey = isLineLive ? line.bucket : moodKey
  const pool = linesFor(poolFor(lineKey, streak), context)
  const index = isLineLive ? line.index : (hostBucket?.index ?? Math.floor(now / AUTO_LINE_MS) + Number.parseInt(hashOf(today), 36))
  const silence = t('……', '…')
  const said = pool.length === 0 ? silence : (pool[index % pool.length]?.text ?? silence)
  const text = host.say?.(said) ?? said

  return {
    now,
    tz,
    local,
    today,
    scan,
    quota,
    github,
    mergeDays,
    merged: mergeTotals(mergeDays),
    party: isParty ? party : null,
    isLevelUp,
    pet,
    range,
    from,
    totals,
    env,
    streak,
    level,
    pips,
    windows,
    mood,
    moodKey,
    action,
    text,
    isPop: line !== null && now - line.at < POP_MS,
    buddy,
  }
}

export type Model = Awaited<ReturnType<typeof readModel>>

export async function press($: EngineInterface, kind: 'feed' | 'pat') {
  const now = await $.clock.now()
  const seed = Math.floor(now / 1000) % 97
  const next = await update($, petState, (pet: SproutPet) => ({
    ...pet,
    action: kind,
    actionAt: now,
    fed: pet.fed + (kind === 'feed' ? 1 : 0),
    patted: pet.patted + (kind === 'pat' ? 1 : 0),
    line: { bucket: kind, index: pet.line?.bucket === kind ? pet.line.index + 1 : seed, at: now },
  }))
  $.clock.after(kind === 'feed' ? FEED_MS : PAT_MS, () => {
    void update($, petState, (pet: SproutPet) => (pet.actionAt === now ? { ...pet, action: null } : pet)).catch(() => {})
  })
  try {
    await $.store.set('counters', { fed: next.fed, patted: next.patted })
  } catch {}
}

export async function talk($: EngineInterface, key: SproutBucket) {
  const now = await $.clock.now()
  const seed = Math.floor(now / 1000) % 97
  await update($, petState, (pet: SproutPet) => ({
    ...pet,
    line: { bucket: key, index: pet.line?.bucket === key ? pet.line.index + 1 : seed, at: now },
  }))
}

export function sceneInputFor(model: Model, width: number) {
  const { rows } = wrapText(model.text, BUBBLE_UNITS, BUBBLE_ROWS)

  return {
    width,
    mood: model.mood,
    action: model.action,
    isConfetti: (model.party !== null || model.isLevelUp) && model.mood === 'party',
    level: model.level,
    pips: model.pips,
    isDay: model.local.hour >= 7 && model.local.hour < 19,
    rows,
    isPop: model.isPop,
  }
}

export function sceneFor(model: Model, width: number) {
  const input = sceneInputFor(model, width)

  return memoize(`scene|${JSON.stringify(input)}`, () => sceneSvg(input))
}

export function trendDays(model: Model) {
  const scan = model.scan
  if (scan === null || scan.firstDay === null) return []

  return calendar(scan.days, model.from, model.today)
}

export async function setRange($: EngineInterface, range: SproutRange) {
  await update($, rangeState, () => range)
  try {
    await $.store.set('range', range)
  } catch {}
}

export async function hydrateRange($: EngineInterface) {
  try {
    const stored = await $.store.get('range')
    if ((stored === '30' || stored === 'all') && stored !== (await read($, rangeState))) await update($, rangeState, () => stored)
  } catch {}
}

export function rangeText(model: Model) {
  const firstDay = model.scan?.firstDay ?? null

  return model.range === 'all' && firstDay !== null ? firstDayText(firstDay, model.today) : t(`最近 ${RECENT_DAYS} 天`, `Last ${RECENT_DAYS} days`)
}

function firstDayText(firstDay: string, today: string) {
  const [y, m, d] = firstDay.split('-').map(Number)
  const isThisYear = y === Number(today.slice(0, 4))
  const zh = `自 ${isThisYear ? '' : `${y} 年 `}${m} 月 ${d} 日起`
  const en = `Since ${monthLabel(m ?? 1)} ${d}${isThisYear ? '' : `, ${y}`}`

  return t(zh, en)
}

export async function introsFor($: EngineInterface, today: string, drawings: Record<SproutIntroKind, string | null>) {
  const isFirst = (Object.keys(drawings) as SproutIntroKind[]).some(kind => drawings[kind] !== null && !introSeen.has(kind))
  let played: SproutIntroPlayed = {}
  if (isFirst) {
    try {
      const stored = await $.store.get(INTRO_KEY)
      if (typeof stored === 'object' && stored !== null) played = stored as SproutIntroPlayed
    } catch {}
  }
  const { intro, started } = introStep(introSeen, drawings, played, today)
  if (started.length > 0) {
    try {
      await $.store.set(INTRO_KEY, { ...played, ...Object.fromEntries(started.map(kind => [kind, today])) })
    } catch {}
  }

  return intro
}

function rangeWord(model: Model) {
  return model.range === '30' ? t('30 天', '30-day') : t('累计', 'All-time')
}

export function tilesInputFor(model: Model, width: number) {
  const { scan, totals } = model
  if (scan === null || totals === null) return null
  const last10 = calendar(scan.days, addDays(model.today, -9), model.today)
  const last7 = calendar(scan.days, addDays(model.today, -6), model.today)

  return {
    width,
    tokensLabel: t(`${rangeWord(model)} token`, `${rangeWord(model)} tokens`),
    tokens: totals.tokens,
    costUsd: totals.costUsd,
    todayUsd: last7.at(-1)?.costUsd ?? 0,
    streak: model.streak,
    week: last7.map(d => d.tokens > 0),
    cacheHitRate: totals.cacheHitRate,
    bars: last10.map(d => d.tokens),
    previous: model.range === 'all' ? scan.previous : null,
  }
}

export function mergedText(model: Model) {
  return t(`${model.mergeDays.length} 天 ${model.merged.prs} 个 PR`, `${model.merged.prs} PRs in ${model.mergeDays.length} days`)
}

export function usedText(model: Model) {
  const firstDay = model.scan?.firstDay ?? null
  if (model.scan === null || firstDay === null) return null
  const span = dayNumber(model.today) - dayNumber(firstDay) + 1
  const active = model.scan.days.filter(d => d.tokens > 0 && d.day <= model.today).length

  return t(`${span} 天里用了 ${active} 天`, `Active ${active} of ${span} days`)
}

export function trendText(days: ReturnType<typeof trendDays>) {
  const { peak, average } = trendStats(days.map(d => d.tokens))

  return t(`峰值 ${formatTokens(peak)} · 7 日均线 ${formatTokens(average)}`, `Peak ${formatTokens(peak)} · 7-day avg ${formatTokens(average)}`)
}

export function githubText(total: number) {
  return t(`过去一年 ${withCommas(total)} 次`, `${withCommas(total)} in the past year`)
}
