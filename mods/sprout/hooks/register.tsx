import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SproutBucket, SproutIntroKind, SproutIntroPlayed, SproutLimit, SproutPet, SproutRange } from '../types'
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
  moodOf,
  levelForTokens,
  lostStreakOf,
  pipsFor,
  samplesOf,
  streakOf,
  untilText,
  weekdayClock,
  whenText,
  withCommas,
  wrapText,
} from './logic'
import { levelLabel } from './levels'
import { capsuleSvg, githubHeatmapSvg, levelOf, tilesSvg, trendSvg, usageHeatmapSvg } from './panels'
import { BUBBLE_ROWS, BUBBLE_UNITS, sceneSvg } from './scene'
import { memoize } from './svg-kit'

// The engine reads state keys off each file's own source, so these atoms are written here and again in data.ts.
const scanState = atom({ plugin: 'sprout', key: 'scan' } as const, null, { shape: 'scan-1' })
const quotaState = atom(
  { plugin: 'sprout', key: 'quota' } as const,
  { at: null, five: null, week: null, samples: [] },
  { shape: 'quota-1' },
)
const githubState = atom({ plugin: 'sprout', key: 'github' } as const, null, { shape: 'github-1' })
const partyState = atom({ plugin: 'sprout', key: 'party' } as const, null)
const petState = atom(
  { plugin: 'sprout', key: 'pet' } as const,
  { action: null, actionAt: 0, line: null, fed: 0, patted: 0 },
  { shape: 'pet-1' },
)
const rangeState = atom({ plugin: 'sprout', key: 'range' } as const, '30')
const envState = atom({ plugin: 'sprout', key: 'env' } as const, { repo: null, tzOffsetMin: null })
const growthState = atom({ plugin: 'sprout', key: 'growth' } as const, { highest: null, levelUp: null })

const PANE = 'sprout'
const TITLE = '芽团'
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
  const scan = await read($, scanState)
  const quota = await read($, quotaState)
  const github = await read($, githubState)
  const party = await read($, partyState)
  const pet = await read($, petState)
  const range = await read($, rangeState)
  const growth = await read($, growthState)

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
    party: isParty ? party : null,
    isLevelUp,
    pet,
    range,
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

function trendDays(model: Model, range: SproutRange) {
  const scan = model.scan
  if (scan === null || scan.firstDay === null) return []
  const from = range === '30' ? addDays(model.today, -29) : scan.firstDay

  return calendar(scan.days, from, model.today)
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

function tilesInputFor(model: Model, width: number) {
  const scan = model.scan
  if (scan === null) return null
  const last10 = calendar(scan.days, addDays(model.today, -9), model.today)
  const last7 = calendar(scan.days, addDays(model.today, -6), model.today)

  return {
    width,
    tokens: scan.totals.tokens,
    costUsd: scan.totals.costUsd,
    todayUsd: last7.at(-1)?.costUsd ?? 0,
    streak: model.streak,
    week: last7.map(d => d.tokens > 0),
    cacheHitRate: scan.totals.cacheHitRate,
    bars: last10.map(d => d.tokens),
    previous: scan.previous,
  }
}

function terminalBar(pct: number) {
  const cells = 12
  const full = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells)

  return `${'█'.repeat(full)}${'░'.repeat(cells - full)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'sprout', description: '打开芽团面板' })
    } catch {}
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => {})
    const started = await next(e)
    startSprout($, e.cwd)

    return started
  })

  on('command.run', { command: 'sprout' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: '芽团来了。' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) void recordLimits($, e.rateLimits).catch(() => {})

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const model = await readModel($)

    if (e.surface === 'terminal') {
      const { Box, Text, Button } = $.ui.resolve(e)
      const scan = model.scan

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="success">● </Text>
            {TITLE}
            <Text dimColor> · {model.env.repo ?? ''}</Text>
          </Text>
          <Text>
            {model.mood === 'sleep' ? '(－_－) zZ' : model.mood === 'worry' ? '(°□°;)' : model.mood === 'party' ? '\\(^o^)/' : '(・ω・)'} 「{model.text}」
          </Text>
          <Text dimColor>
            {levelLabel(model.level)} {'●'.repeat(model.pips)}
            {'○'.repeat(7 - model.pips)}
          </Text>
          <Box flexDirection="row" gap={1}>
            <Button key="feed" label="喂水" onPress={() => void press($, 'feed')} />
            <Button key="pat" label="摸摸" onPress={() => void press($, 'pat')} />
            <Button key="sass" label="再嘴一句" onPress={() => void talk($, model.moodKey)} />
          </Box>
          {model.windows.map(w => {
            const fc = w.forecast === null ? null : Math.round(w.forecast.projected)
            const sentence = forecastText(w, model.now, model.tz)
            return (
              <Box flexDirection="column">
                <Text>
                  {w.label} {terminalBar(w.limit.pct)} {Math.round(w.limit.pct)}%
                  {fc === null ? '' : fc > 100 ? ` 超 ${fc - 100}%` : ` → ${fc}%`}
                  <Text dimColor> {resetText(w, model.now, model.tz)}</Text>
                </Text>
                {sentence === null ? null : <Text color={fc !== null && fc > 100 ? 'error' : undefined} dimColor={!(fc !== null && fc > 100)}>  {sentence}</Text>}
              </Box>
            )
          })}
          {scan === null ? (
            <Text dimColor>正在翻你的聊天记录，第一次要一两分钟。</Text>
          ) : (
            <Text>
              累计 {formatTokens(scan.totals.tokens)} token · {formatUsd(scan.totals.costUsd)} · 连续 {model.streak} 天 · 缓存命中{' '}
              {(scan.totals.cacheHitRate * 100).toFixed(1)}%
            </Text>
          )}
          {model.github === null ? null : <Text dimColor>GitHub 过去一年 {withCommas(model.github.total)} 次</Text>}
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const width = contentWidth(e.props.bodyColumns)
    const scan = model.scan
    const isStale = model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS
    const sectionHead = (left: string, right: JSX.Element | null) => (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="sm">
        <Text dimColor>{left}</Text>
        {right}
      </Box>
    )

    const trend = trendDays(model, model.range)
    const firstDay = scan?.firstDay ?? null
    const tilesInput = tilesInputFor(model, width)
    const drawings = {
      tiles: tilesInput === null ? null : `tiles|${JSON.stringify(tilesInput)}`,
      trend: trend.length < 2 ? null : `trend|${width}|${trend.map(d => d.tokens).join(',')}`,
      clay: scan === null || firstDay === null ? null : `clay|${width}|${model.today}|${firstDay}|${scan.days.map(d => `${d.day}:${d.tokens}`).join(',')}`,
    }
    const intro = await introsFor($, model.today, drawings)
    const tiles =
      tilesInput === null
        ? null
        : memoize(`${drawings.tiles}|${intro.has('tiles')}`, () => tilesSvg({ ...tilesInput, isIntro: intro.has('tiles') }))
    const trendSource =
      drawings.trend === null ? null : memoize(`${drawings.trend}|${intro.has('trend')}`, () => trendSvg(width, trend, intro.has('trend')) ?? '')
    const clayDrawing =
      scan === null || firstDay === null
        ? null
        : memoize(`${drawings.clay}|${intro.has('clay')}`, () => usageHeatmapSvg(width, scan.days, firstDay, model.today, intro.has('clay')))
    const span = firstDay === null ? 0 : dayNumber(model.today) - dayNumber(firstDay) + 1
    const activeDays = scan === null ? 0 : scan.days.filter(d => d.tokens > 0 && d.day <= model.today).length
    const levels = model.github?.levels ?? null
    const ghDrawing = levels === null ? null : memoize(`gh|${width}|${levels}`, () => githubHeatmapSvg(width, levels))

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
          <Svg source={sceneFor(model, width)} alt={`芽团，${levelLabel(model.level)}：${model.text}`} />
          <Box flexDirection="row" flexWrap="nowrap" gap="sm">
            <Button key="feed" label="喂水" onPress={() => void press($, 'feed')} />
            <Button key="pat" label="摸摸" onPress={() => void press($, 'pat')} />
            <Button key="sass" label="再嘴一句" onPress={() => void talk($, model.moodKey)} />
          </Box>
        </Box>

        <Box flexDirection="column" gap="sm">
          {sectionHead('额度', isStale && model.quota.at !== null ? <Text dimColor>{agoText(model.quota.at, model.now)}</Text> : null)}
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
                    <Text>{w.label}</Text>
                    <Text dimColor>{resetText(w, model.now, model.tz)}</Text>
                  </Box>
                  <Svg source={source} alt={`${w.label}已用 ${Math.round(w.limit.pct)}%`} />
                  {sentence === null ? null : isOver ? <Text color="error">{sentence}</Text> : <Text dimColor>{sentence}</Text>}
                </Box>
              )
            })
          )}
        </Box>

        {scan === null || firstDay === null || tiles === null ? (
          <Text dimColor>正在翻你的聊天记录，第一次要一两分钟。</Text>
        ) : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(firstDayText(firstDay, model.today), <Text dimColor>按 API 价格估算</Text>)}
            <Svg
              source={tiles}
              alt={`累计 ${formatTokens(scan.totals.tokens)} token，估算 ${formatUsd(scan.totals.costUsd)}，连续 ${model.streak} 天，缓存命中 ${(scan.totals.cacheHitRate * 100).toFixed(1)}%`}
            />
          </Box>
        )}

        {trendSource === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(
              '每日 token',
              <Box flexDirection="row" gap="xs" flexWrap="nowrap">
                <Button key="range-30" label="30 天" dimColor={model.range !== '30'} onPress={() => void update($, rangeState, () => '30' as const)} />
                <Button key="range-all" label="全部" dimColor={model.range !== 'all'} onPress={() => void update($, rangeState, () => 'all' as const)} />
              </Box>,
            )}
            <Svg source={trendSource} alt={`每日 token，${model.range === '30' ? '最近 30 天' : '全部'}`} />
          </Box>
        )}

        {clayDrawing === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead('Claude 使用', <Text dimColor>{`${span} 天里用了 ${activeDays} 天`}</Text>)}
            <Svg source={clayDrawing.svg} alt={`${span} 天里用了 ${activeDays} 天`} />
          </Box>
        )}

        {ghDrawing === null || model.github === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead('GitHub 贡献', <Text dimColor>{`过去一年 ${withCommas(model.github.total)} 次`}</Text>)}
            <Svg source={ghDrawing.svg} alt={`GitHub 过去一年 ${withCommas(model.github.total)} 次贡献`} />
          </Box>
        )}
      </Box>
    )
  }).catch(($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>芽团打了个盹，过会儿再来。</Text>
  })
}
