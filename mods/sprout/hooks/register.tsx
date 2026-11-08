import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SproutBucket, SproutBuddy, SproutIntroKind, SproutIntroPlayed, SproutLimit, SproutPet, SproutRange } from '../types'
import { withOthers } from './buddy'
import { recordLimits, startSprout } from './data'
import type { LineContext } from './lines'
import { linesFor } from './lines'
import type { Forecast, Mood } from './logic'
import {
  FIVE_HOUR,
  MINUTE_MS,
  SEVEN_DAY,
  addDays,
  agoText,
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
import { levelLabel } from './levels'
import {
  capsuleSvg,
  githubHeatmapSvg,
  githubLevels,
  levelOf,
  mergesSvg,
  tilesSvg,
  trendStats,
  trendSvg,
  usageHeatmapSvg,
  usageLevels,
} from './panels'
import type { Scheme } from './raster'
import { BUBBLE_ROWS, BUBBLE_UNITS, sceneSvg } from './scene'
import { memoize } from './svg-kit'
import { buddyServer, cancelConnect, disconnectBuddy, hideOffer, reconnectBuddy, setBuddyServer, startConnect, syncBuddy } from './sync'
import type { TerminalSync, TerminalView } from './terminal'
import { terminalPane } from './terminal'

// The engine reads state keys off each file's own source, so these atoms are written here and again in data.ts.
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

const PANE = 'sprout'
const TITLE = '小苗'
const FEED_MS = 1800
const PAT_MS = 1200
const POP_MS = 1000
const LINE_FRESH_MS = 5 * MINUTE_MS
const AUTO_LINE_MS = 10 * MINUTE_MS
const STALE_QUOTA_MS = 15 * MINUTE_MS
const CELL_PX = 7.2
const MOOD_KEYS = new Set<SproutBucket>(['happy', 'worry', 'sleep', 'party', 'night', 'streak', 'levelup', 'broken'])
const INTRO_KEY = 'introPlayed'
const introSeen = new Map<SproutIntroKind, string | null>()

/** On desktop a cell is the code font's advance, so the pane's pixel width is about the columns times that. */
function contentWidth(columns: number) {
  return Math.max(312, Math.min(480, Math.round((columns * CELL_PX) / 4) * 4))
}

type Window = {
  kind: 'five' | 'week'
  label: string
  limit: SproutLimit
  forecast: Forecast | null
}

function poolFor(key: SproutBucket, streak: number): SproutBucket[] {
  return key === 'happy' && streak >= 7 ? ['happy', 'streak'] : [key]
}

function resetText(window: Window, now: number, tz: number) {
  const at = window.limit.resetsAt
  if (at === null) return window.limit.pct === 0 ? '已重置' : ''
  if (window.kind === 'five') return `${untilText(at, now)}后重置`

  return `${weekdayClock(at, tz)} 重置`
}

function forecastText(window: Window, now: number, tz: number) {
  const { limit } = window
  const fc = window.forecast
  if (limit.pct >= 100) {
    return limit.resetsAt === null ? '已用完' : `已用完，${whenText(limit.resetsAt, now, tz)} 恢复`
  }
  if (fc === null) return null
  const basis =
    window.kind === 'five'
      ? fc.basis === 'recent'
        ? '按最近 1 小时的速度'
        : '按这个窗口的平均速度'
      : fc.basis === 'recent'
        ? '按最近 24 小时的速度'
        : '按本周的平均速度'
  if (fc.fullAt !== null) return `${basis}，${whenText(fc.fullAt, now, tz)} 左右就用完`
  const projected = Math.round(fc.projected)
  if (window.kind === 'five') return `${basis}，重置时约 ${projected}%`

  return `${basis}，重置时还剩约 ${Math.max(0, 100 - projected)}%`
}

async function readModel($: EngineInterface) {
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
  const add = (kind: 'five' | 'week', label: string, raw: SproutLimit | null) => {
    const limit = liveLimit(raw, now)
    if (limit === null) return
    const fc =
      limit.resetsAt === null || quota.at === null
        ? null
        : forecast(samplesOf(quota.samples, kind), { pct: limit.pct, at: quota.at, resetsAt: limit.resetsAt }, kind === 'five' ? FIVE_HOUR : SEVEN_DAY)
    windows.push({ kind, label, limit, forecast: fc })
  }
  add('five', '5 小时', quota.five)
  add('week', '本周', quota.week)
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
    fed: pet.fed,
    patted: pet.patted,
    time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
  }
  const moodKey = bucketsFor(mood, local.hour, streak, { isLevelUp, lost })[0] ?? 'happy'
  const line = pet.line
  const isLineLive =
    line !== null && now - line.at < LINE_FRESH_MS && (!MOOD_KEYS.has(line.bucket) || line.bucket === moodKey)
  const lineKey = isLineLive ? line.bucket : moodKey
  const pool = linesFor(poolFor(lineKey, streak), context)
  const index = isLineLive ? line.index : Math.floor(now / AUTO_LINE_MS) + Number.parseInt(hashOf(today), 36)
  const text = pool.length === 0 ? '……' : (pool[index % pool.length]?.text ?? '……')

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

type Model = Awaited<ReturnType<typeof readModel>>

async function press($: EngineInterface, kind: 'feed' | 'pat') {
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

async function talk($: EngineInterface, key: SproutBucket) {
  const now = await $.clock.now()
  const seed = Math.floor(now / 1000) % 97
  await update($, petState, (pet: SproutPet) => ({
    ...pet,
    line: { bucket: key, index: pet.line?.bucket === key ? pet.line.index + 1 : seed, at: now },
  }))
}

function sceneFor(model: Model, width: number) {
  const { rows } = wrapText(model.text, BUBBLE_UNITS, BUBBLE_ROWS)
  const input = {
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

  return memoize(`scene|${JSON.stringify(input)}`, () => sceneSvg(input))
}

function trendDays(model: Model) {
  const scan = model.scan
  if (scan === null || scan.firstDay === null) return []

  return calendar(scan.days, model.from, model.today)
}

async function setRange($: EngineInterface, range: SproutRange) {
  await update($, rangeState, () => range)
  try {
    await $.store.set('range', range)
  } catch {}
}

async function hydrateRange($: EngineInterface) {
  try {
    const stored = await $.store.get('range')
    if ((stored === '30' || stored === 'all') && stored !== (await read($, rangeState))) await update($, rangeState, () => stored)
  } catch {}
}

function rangeText(model: Model) {
  const firstDay = model.scan?.firstDay ?? null

  return model.range === 'all' && firstDay !== null ? firstDayText(firstDay, model.today) : `最近 ${RECENT_DAYS} 天`
}

function firstDayText(firstDay: string, today: string) {
  const [y, m, d] = firstDay.split('-').map(Number)
  const year = y === Number(today.slice(0, 4)) ? '' : `${y} 年 `

  return `自 ${year}${m} 月 ${d} 日起`
}

async function introsFor($: EngineInterface, today: string, drawings: Record<SproutIntroKind, string | null>) {
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
  return model.range === '30' ? '30 天' : '累计'
}

function tilesInputFor(model: Model, width: number) {
  const { scan, totals } = model
  if (scan === null || totals === null) return null
  const last10 = calendar(scan.days, addDays(model.today, -9), model.today)
  const last7 = calendar(scan.days, addDays(model.today, -6), model.today)

  return {
    width,
    tokensLabel: `${rangeWord(model)} token`,
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

function mergedText(model: Model) {
  return `${model.mergeDays.length} 天 ${model.merged.prs} 个 PR`
}

function usedText(model: Model) {
  const firstDay = model.scan?.firstDay ?? null
  if (model.scan === null || firstDay === null) return null
  const span = dayNumber(model.today) - dayNumber(firstDay) + 1
  const active = model.scan.days.filter(d => d.tokens > 0 && d.day <= model.today).length

  return `${span} 天里用了 ${active} 天`
}

function trendText(days: ReturnType<typeof trendDays>) {
  const { peak, average } = trendStats(days.map(d => d.tokens))

  return `峰值 ${formatTokens(peak)} · 7 日均线 ${formatTokens(average)}`
}

/** The terminal tells no plugin its colors, so we take the scheme from the theme the person chose. */
async function schemeOf($: EngineInterface): Promise<Scheme> {
  try {
    const theme = (await $.config.list()).find(row => row.key === 'theme')?.value

    return typeof theme === 'string' && theme.includes('light') ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function githubText(total: number) {
  return `过去一年 ${withCommas(total)} 次`
}

/** One quiet line on syncing to the phone: the offer, the connect in progress, or the link and its last upload. */
function syncView($: EngineInterface, buddy: SproutBuddy, now: number): TerminalSync | null {
  if (buddy.isReady !== true) return null
  const connect = buddy.connect
  if (connect !== null) {
    return {
      text: `在浏览器里确认连接 · 代码 ${connect.code}`,
      link: { href: connect.url, label: '打开页面' },
      buttons: [{ key: 'buddy-cancel', label: '取消', isPrimary: false, onPress: () => void cancelConnect($).catch(() => {}) }],
    }
  }
  const link = buddy.link
  if (link !== null) {
    const text =
      buddy.error === 'unauthorized'
        ? 'Buddy 不认这台 Mac 了'
        : buddy.error === 'network'
          ? '暂时连不上 Buddy，稍后再同步'
          : buddy.upload === null
            ? '已连接，等第一次同步'
            : `已同步到手机 · ${agoText(buddy.upload.at, now)}`
    return {
      text,
      link: { href: `${link.server}/u/${link.user}`, label: '我的页面' },
      buttons:
        buddy.error === 'unauthorized'
          ? [
              { key: 'buddy-again', label: '重新连接', isPrimary: true, onPress: () => void reconnectBuddy($).catch(() => {}) },
              { key: 'buddy-off', label: '断开', isPrimary: false, onPress: () => void disconnectBuddy($).catch(() => {}) },
            ]
          : [{ key: 'buddy-off', label: '断开', isPrimary: false, onPress: () => void disconnectBuddy($).catch(() => {}) }],
    }
  }
  if (buddy.isOfferHidden && buddy.note === null) return null

  return {
    text: buddy.note ?? '手机上也想看小苗？',
    link: null,
    buttons: [
      { key: 'buddy-sync', label: '同步到手机', isPrimary: true, onPress: () => void startConnect($).catch(() => {}) },
      { key: 'buddy-no', label: '不用', isPrimary: false, onPress: () => void hideOffer($, true).catch(() => {}) },
    ],
  }
}

async function runSproutCommand($: EngineInterface, args: string) {
  const [verb = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const buddy = await read($, buddyState)
  switch (verb) {
    case '': {
      await $.ui.open({ id: PANE, title: TITLE })
      return '小苗来了。'
    }
    case 'sync': {
      if (buddy.isReady !== true) return '这台电脑上同步不了：需要 macOS 的钥匙串和 node。'
      if (buddy.link !== null) {
        await syncBuddy($, true)
        const after = await read($, buddyState)
        return after.error === null ? '已同步到手机。' : after.error === 'unauthorized' ? 'Buddy 不认这台 Mac 了，在面板里点「重新连接」。' : '暂时连不上 Buddy。'
      }
      await hideOffer($, false)
      await startConnect($)
      const after = await read($, buddyState)
      return after.connect === null ? (after.note ?? '暂时连不上 Buddy。') : `在浏览器里确认连接，代码 ${after.connect.code}：${after.connect.url}`
    }
    case 'server': {
      const value = rest[0]
      if (value === undefined) return `Buddy 服务器：${await buddyServer($)}`
      const server = await setBuddyServer($, value === 'default' ? null : value)
      return server === null ? '要一个 http(s) 地址，或 default。' : `Buddy 服务器：${server}`
    }
    case 'disconnect': {
      await disconnectBuddy($)
      return '已断开。钥匙留在这台 Mac 上，再连还是同一台。要连同它的数据一起去掉，在 Buddy 的「我的 Mac」里移除。'
    }
    default:
      return '用法：/sprout、/sprout sync、/sprout server <地址|default>、/sprout disconnect'
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'sprout', description: '打开小苗面板；sync 同步到手机', argumentHint: '[sync | server <url> | disconnect]' })
    } catch {}
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})
    void hydrateRange($)
    const started = await next(e)
    startSprout($, e.cwd)

    return started
  })

  on('command.run', { command: 'sprout' }, async ($, e) => ({ text: await runSproutCommand($, e.args) }))

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) void recordLimits($, e.rateLimits).catch(() => {})

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const model = await readModel($)
    const trend = trendDays(model)
    const used = usedText(model)

    if (e.surface === 'terminal') {
      const tiles = tilesInputFor(model, 0)
      const scan = model.scan
      const firstDay = scan?.firstDay ?? null
      const view: TerminalView = {
        width: e.props.bodyColumns,
        scheme: await schemeOf($),
        title: TITLE,
        repo: model.env.repo ?? '',
        pet: {
          mood: model.mood,
          action: model.action,
          isConfetti: (model.party !== null || model.isLevelUp) && model.mood === 'party',
          level: model.level,
          pips: model.pips,
          isDay: model.local.hour >= 7 && model.local.hour < 19,
          text: model.text,
        },
        quota: {
          windows: model.windows.map(w => ({
            label: w.label,
            pct: w.limit.pct,
            projected: w.forecast?.projected ?? null,
            reset: resetText(w, model.now, model.tz),
            sentence: forecastText(w, model.now, model.tz),
          })),
          note: model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS ? `更新于 ${agoText(model.quota.at, model.now)}` : null,
        },
        stats:
          tiles === null || firstDay === null
            ? null
            : {
                heading: rangeText(model),
                range: model.range,
                tiles: {
                  tokensLabel: tiles.tokensLabel,
                  tokens: tiles.tokens,
                  costUsd: formatUsd(tiles.costUsd),
                  todayUsd: tiles.todayUsd > 0 ? formatUsd(tiles.todayUsd) : null,
                  streak: tiles.streak,
                  week: tiles.week,
                  cacheHitRate: tiles.cacheHitRate,
                  bars: tiles.bars,
                },
              },
        trend,
        merges: model.merged.prs === 0 ? null : { days: model.mergeDays, heading: mergedText(model) },
        usage: scan === null || firstDay === null || used === null ? null : { levelOn: usageLevels(scan.days, firstDay), heading: used },
        github: model.github === null ? null : { levelOn: githubLevels(model.github.start, model.github.levels), heading: githubText(model.github.total) },
        today: model.today,
        rows: e.props.placement === 'dock' ? e.props.scroll.bodyRows : null,
        sync: syncView($, model.buddy, model.now),
        on: {
          feed: () => void press($, 'feed'),
          pat: () => void press($, 'pat'),
          sass: () => void talk($, model.moodKey),
          range: range => void setRange($, range),
        },
      }

      return terminalPane($.ui.resolve(e), view)
    }

    const { Box, Text, Button, Svg, Link } = $.ui.resolve(e)
    const width = contentWidth(e.props.bodyColumns)
    const sync = syncView($, model.buddy, model.now)
    const scan = model.scan
    const isStale = model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS
    const sectionHead = (left: string, right: JSX.Element | null) => (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="sm">
        <Text dimColor>{left}</Text>
        {right}
      </Box>
    )

    const firstDay = scan?.firstDay ?? null
    const github = model.github
    const tilesInput = tilesInputFor(model, width)
    const drawings = {
      tiles: tilesInput === null ? null : `tiles|${JSON.stringify(tilesInput)}`,
      trend: trend.length < 2 ? null : `trend|${width}|${trend.map(d => d.tokens).join(',')}`,
      merges: model.merged.prs === 0 ? null : `merges|${width}|${model.mergeDays.map(d => `${d.prs}:${d.additions}:${d.deletions}`).join(',')}`,
      clay: scan === null || firstDay === null ? null : `clay|${width}|${model.today}|${firstDay}|${scan.days.map(d => `${d.day}:${d.tokens}`).join(',')}`,
      github: github === null ? null : `gh|${width}|${model.today}|${github.start}|${github.levels}`,
    }
    const intro = await introsFor($, model.today, drawings)
    const tiles =
      tilesInput === null
        ? null
        : memoize(`${drawings.tiles}|${intro.has('tiles')}`, () => tilesSvg({ ...tilesInput, isIntro: intro.has('tiles') }))
    const trendSource =
      drawings.trend === null ? null : memoize(`${drawings.trend}|${intro.has('trend')}`, () => trendSvg(width, trend, intro.has('trend')) ?? '')
    const mergesSource =
      drawings.merges === null
        ? null
        : memoize(`${drawings.merges}|${intro.has('merges')}`, () => mergesSvg(width, model.mergeDays, intro.has('merges')) ?? '')
    const clayDrawing =
      scan === null || firstDay === null
        ? null
        : memoize(`${drawings.clay}|${intro.has('clay')}`, () => usageHeatmapSvg(width, scan.days, firstDay, model.today, intro.has('clay')))
    const ghDrawing =
      github === null
        ? null
        : memoize(`${drawings.github}|${intro.has('github')}`, () =>
            githubHeatmapSvg(width, github.start, github.levels, model.today, intro.has('github')),
          )

    return (
      <Box flexDirection="column" gap="lg">
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Text color="#3F8F4A">●</Text>
          <Text weight="medium">{TITLE}</Text>
          <Box flexGrow={1} />
          <Text dimColor wrap="truncate-end">
            {model.env.repo ?? ''}
          </Text>
        </Box>

        <Box flexDirection="column" gap="sm">
          <Svg source={sceneFor(model, width)} alt={`小苗，${levelLabel(model.level)}：${model.text}`} />
          <Box flexDirection="row" flexWrap="nowrap" gap="sm">
            <Button key="feed" label="喂水" onPress={() => void press($, 'feed')} />
            <Button key="pat" label="摸摸" onPress={() => void press($, 'pat')} />
            <Button key="sass" label="再嘴一句" onPress={() => void talk($, model.moodKey)} />
          </Box>
        </Box>

        <Box flexDirection="column" gap="sm">
          {sectionHead('额度', isStale && model.quota.at !== null ? <Text dimColor>{`更新于 ${agoText(model.quota.at, model.now)}`}</Text> : null)}
          {model.windows.length === 0 ? (
            <Text dimColor>还没有额度读数。用订阅账号发一句话，我就看得到了。</Text>
          ) : (
            model.windows.map(w => {
              const projected = w.forecast === null ? null : w.forecast.projected
              const sentence = forecastText(w, model.now, model.tz)
              const isOver = levelOf(w.limit.pct, projected) === 'over'
              const source = memoize(`cap|${width}|${w.limit.pct}|${projected === null ? -1 : Math.round(projected)}`, () =>
                capsuleSvg(width, w.limit.pct, projected === null ? null : Math.round(projected)),
              )
              return (
                <Box flexDirection="column" gap="xs">
                  <Box flexDirection="row" justifyContent="space-between" gap="sm">
                    <Text dimColor>{w.label}</Text>
                    <Text dimColor>{resetText(w, model.now, model.tz)}</Text>
                  </Box>
                  <Svg source={source} alt={`${w.label}已用 ${Math.round(w.limit.pct)}%`} />
                  {sentence === null ? null : isOver ? <Text color="error">{sentence}</Text> : <Text dimColor>{sentence}</Text>}
                </Box>
              )
            })
          )}
        </Box>

        {scan === null || firstDay === null || tiles === null || tilesInput === null ? (
          <Text dimColor>正在翻你的聊天记录，第一次要一两分钟。</Text>
        ) : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(
              rangeText(model),
              <Box flexDirection="row" gap="xs" flexWrap="nowrap">
                <Button key="range-30" label="30 天" plain dimColor={model.range !== '30'} onPress={() => void setRange($, '30')} />
                <Button key="range-all" label="全部" plain dimColor={model.range !== 'all'} onPress={() => void setRange($, 'all')} />
              </Box>,
            )}
            <Svg
              source={tiles}
              alt={`${rangeText(model)}：${formatTokens(tilesInput.tokens)} token，按 API 价格估算 ${formatUsd(tilesInput.costUsd)}，今天 ${formatUsd(tilesInput.todayUsd)}；连续使用 ${model.streak} 天；缓存命中 ${(tilesInput.cacheHitRate * 100).toFixed(1)}%`}
            />
          </Box>
        )}

        {trendSource === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead('每日 token', null)}
            <Svg source={trendSource} alt={`每日 token，最近 ${trend.length} 天，${trendText(trend)}`} />
          </Box>
        )}

        {mergesSource === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(
              '每日合并',
              <Text dimColor wrap="truncate-end">
                {mergedText(model)}
              </Text>,
            )}
            <Svg
              source={mergesSource}
              alt={`最近 ${model.mergeDays.length} 天合并 ${model.merged.prs} 个 PR，共改动 ${withCommas(model.merged.additions + model.merged.deletions)} 行：新增 ${withCommas(model.merged.additions)} 行，删除 ${withCommas(model.merged.deletions)} 行`}
            />
          </Box>
        )}

        {clayDrawing === null || used === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead('Claude 使用', <Text dimColor>{used}</Text>)}
            <Svg source={clayDrawing.svg} alt={`Claude 使用，${used}`} />
          </Box>
        )}

        {ghDrawing === null || github === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead('GitHub 贡献', <Text dimColor>{githubText(github.total)}</Text>)}
            <Svg source={ghDrawing.svg} alt={`GitHub 贡献，${githubText(github.total)}`} />
          </Box>
        )}

        {sync === null ? null : (
          <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
            <Text dimColor>{sync.text}</Text>
            {sync.link === null ? null : <Link href={sync.link.href} label={sync.link.label} />}
            {sync.buttons.map(button =>
              button.isPrimary ? (
                <Button key={button.key} label={button.label} onPress={button.onPress} />
              ) : (
                <Button key={button.key} label={button.label} plain dimColor onPress={button.onPress} />
              ),
            )}
          </Box>
        )}
      </Box>
    )
  }).catch(($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>小苗打了个盹，过会儿再来。</Text>
  })
}
