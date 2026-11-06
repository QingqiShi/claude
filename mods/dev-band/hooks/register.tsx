import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, ThemeKey, TurnUsage } from 'claude-code'

import type { DevBandAgent, DevBandCache, DevBandCacheTtl, DevBandContext, DevBandCostEntry } from '../types'
import type { CacheDrawing } from './svg'
import {
  cacheSize,
  cacheSvg,
  DIVIDER_SVG,
  dividerSize,
  meterSize,
  meterSvg,
  odometerSize,
  odometerSvg,
  orbitSize,
  orbitSvg,
  pillSize,
  pillSvg,
  sparkSize,
  sparkSvg,
  textWidth,
} from './svg'

const cost = atom(
  { plugin: 'dev-band', key: 'cost' } as const,
  { usd: null, previousUsd: null, history: [] },
  { shape: 'cost-1' },
)
const context = atom({ plugin: 'dev-band', key: 'context' } as const, null)
const agents = atom({ plugin: 'dev-band', key: 'agents' } as const, [])
const NO_CACHE: DevBandCache = {
  sentAt: null,
  inFlightSince: null,
  isCold: false,
  ttl: '1h',
  ttlSource: 'default',
  model: null,
  promptTokens: 0,
}
const cache = atom({ plugin: 'dev-band', key: 'cache' } as const, NO_CACHE, {
  shape: 'cache-1',
})

const AGENT_POLL_MS = 3000
const FRESH_MS = 6000
const HISTORY_SIZE = 12
const METER_CELLS = 12
const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const PIE_BLOCKS = ['◔', '◑', '◕', '●']
const TTL_MS: Record<DevBandCacheTtl, number> = {
  '5m': 300_000,
  '1h': 3_600_000,
}
const LOW_SHARE = 0.2
const GAP_SLACK_MS = 15_000
const HIT_SHARE = 0.5
const REDRAW_LATE_MS = 25

let requestRefresh: (() => void) | null = null
let redraw: { at: number; cancel: () => void } | null = null

const ACTIVE_STATUSES = new Set(['pending', 'running', 'waiting'])

function toContext(usage: SessionContextUsage | undefined, limit: number | null): DevBandContext | null {
  if (!usage || usage.tokens === undefined) return null
  const window = limit ?? usage.window
  if (window <= 0) return null

  return {
    percent: Math.round((usage.tokens / window) * 100),
    tokens: usage.tokens,
    window,
  }
}

async function readCompactWindow($: EngineInterface) {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const breakdown = context.breakdown
    if (!breakdown?.isAutoCompactEnabled) return null

    return breakdown.rawMaxTokens
  } catch {
    return null
  }
}

function hasGrown(total: number | null, usd: number) {
  return usd > 0 && (total === null || usd > total + 1e-9)
}

async function recordCost($: EngineInterface, usd: number) {
  if (!hasGrown((await read($, cost)).usd, usd)) return
  const at = await $.clock.now()
  await update($, cost, value => {
    if (!hasGrown(value.usd, usd)) return value
    const entry: DevBandCostEntry = { delta: usd - (value.usd ?? 0), at }

    return {
      usd,
      previousUsd: value.usd,
      history: [...(value.history ?? []), entry].slice(-HISTORY_SIZE),
    }
  })
  $.clock.after(FRESH_MS + 100, () => $.ui.invalidate('ui.render'))
}

function startRefreshing($: EngineInterface) {
  let isRunning = false
  let isAgain = false
  let stopPoll: (() => void) | null = null
  let compactWindow: { model: number; limit: number | null } | null = null
  const last = new Map<string, string>()

  function isChanged(key: string, value: unknown) {
    const text = JSON.stringify(value)
    if (last.get(key) === text) return false
    last.set(key, text)

    return true
  }

  async function refresh() {
    if (isRunning) {
      isAgain = true
      return
    }
    isRunning = true
    try {
      do {
        isAgain = false
        const usage = await $.session.usage()
        if (usage.cost !== undefined) await recordCost($, usage.cost.usd)
        if (compactWindow?.model !== usage.context.window) {
          compactWindow = {
            model: usage.context.window,
            limit: await readCompactWindow($),
          }
        }
        const fill = toContext(usage.context, compactWindow.limit)
        if (isChanged('context', fill)) await update($, context, () => fill)

        const listed = await $.agent.list()
        const running: DevBandAgent[] = listed
          .filter(agent => ACTIVE_STATUSES.has(agent.status))
          .map(agent => ({ id: agent.id, description: agent.description }))
        if (isChanged('agents', running)) await update($, agents, () => running)

        if (running.length > 0 && stopPoll === null) {
          stopPoll = $.clock.every(AGENT_POLL_MS, () => void refresh()).cancel
        } else if (running.length === 0 && stopPoll !== null) {
          stopPoll()
          stopPoll = null
        }
      } while (isAgain)
    } finally {
      isRunning = false
    }
  }

  requestRefresh = () => void refresh().catch(() => {})
  requestRefresh()
}

function formatUsd(usd: number) {
  return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`

  return String(n)
}

function fillColor(percent: number): ThemeKey {
  if (percent > 85) return 'error'
  if (percent >= 60) return 'warning'

  return 'success'
}

function sparkBlock(delta: number, max: number) {
  const index = max > 0 ? Math.round((delta / max) * (SPARK_BLOCKS.length - 1)) : 0

  return SPARK_BLOCKS[Math.max(0, Math.min(SPARK_BLOCKS.length - 1, index))] ?? SPARK_BLOCKS[0]
}

function promptTokens(usage: TurnUsage) {
  return usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
}

function seenTtl(previous: DevBandCache, sentAt: number, usage: TurnUsage): DevBandCacheTtl | null {
  if (previous.sentAt === null || previous.isCold || previous.model !== usage.model) return null
  if (previous.promptTokens <= 0) return null
  const gap = sentAt - previous.sentAt
  if (gap <= TTL_MS['5m'] + GAP_SLACK_MS || gap >= TTL_MS['1h'] - GAP_SLACK_MS) return null

  return usage.cache_read_input_tokens >= previous.promptTokens * HIT_SHARE ? '1h' : '5m'
}

function settleStep(value: DevBandCache, sentAt: number, usage: TurnUsage | null): DevBandCache {
  if (usage === null || usage.cache_read_input_tokens + usage.cache_creation_input_tokens === 0) {
    return value.inFlightSince === null ? value : { ...value, inFlightSince: null }
  }
  const seen = seenTtl(value, sentAt, usage)
  const isTrusted = seen === '1h' || (seen === '5m' && value.ttlSource === 'default')

  return {
    sentAt,
    inFlightSince: null,
    isCold: false,
    ttl: isTrusted && seen !== null ? seen : value.ttl,
    ttlSource: isTrusted ? 'seen' : value.ttlSource,
    model: usage.model,
    promptTokens: promptTokens(usage),
  }
}

function resumed(
  value: DevBandCache,
  lastAt: number,
  seconds: number,
  isLikelyExpired: boolean | undefined,
): DevBandCache {
  const away = seconds * 1000
  const told: DevBandCacheTtl | null =
    isLikelyExpired === undefined
      ? null
      : isLikelyExpired
        ? away < TTL_MS['1h']
          ? '5m'
          : null
        : away > TTL_MS['5m']
          ? '1h'
          : null
  const isTold = told !== null && (value.ttlSource === 'default' || value.ttlSource === 'resume')
  const isNewer = value.sentAt === null || lastAt > value.sentAt

  return {
    ...value,
    ttl: isTold ? told : value.ttl,
    ttlSource: isTold ? 'resume' : value.ttlSource,
    sentAt: isNewer ? lastAt : value.sentAt,
    isCold: isNewer ? false : value.isCold,
  }
}

type CacheView =
  | { kind: 'refreshing'; ttl: DevBandCacheTtl }
  | {
      kind: 'warm'
      ttl: DevBandCacheTtl
      remainingMs: number
      fraction: number
      isLow: boolean
    }
  | { kind: 'expired' | 'cold' }

function toCacheView(value: DevBandCache, now: number): CacheView | null {
  if (value.sentAt === null) return null
  if (value.inFlightSince !== null) return { kind: 'refreshing', ttl: value.ttl }
  if (value.isCold) return { kind: 'cold' }
  const ttlMs = TTL_MS[value.ttl]
  const remainingMs = value.sentAt + ttlMs - now
  if (remainingMs <= 0) return { kind: 'expired' }

  return {
    kind: 'warm',
    ttl: value.ttl,
    remainingMs,
    fraction: Math.min(1, remainingMs / ttlMs),
    isLow: remainingMs <= ttlMs * LOW_SHARE,
  }
}

function formatRemaining(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  if (seconds >= 3600) return '1 小时'
  if (seconds >= 120) return `${Math.floor(seconds / 60)} 分钟`

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function nextChangeIn(view: CacheView) {
  if (view.kind !== 'warm') return null
  const seconds = Math.ceil(view.remainingMs / 1000)
  const nextSeconds = seconds >= 120 ? Math.floor(seconds / 60) * 60 - 1 : seconds - 1
  const toText = view.remainingMs - nextSeconds * 1000
  const toLow = view.remainingMs - TTL_MS[view.ttl] * LOW_SHARE

  return toLow > 0 ? Math.min(toText, toLow) : toText
}

function scheduleRedraw($: EngineInterface, now: number, delay: number | null) {
  const at = delay === null ? null : now + delay
  if (redraw !== null && at !== null && Math.abs(redraw.at - at) < 50) return
  redraw?.cancel()
  redraw = null
  if (at === null || delay === null) return
  const entry = { at, cancel: () => {} }
  entry.cancel = $.clock.after(delay + REDRAW_LATE_MS, () => {
    if (redraw === entry) redraw = null
    $.ui.invalidate('ui.render')
  }).cancel
  redraw = entry
}

function formatTtl(ttl: '1h' | '5m') {
  return ttl === '1h' ? '1 小时' : '5 分钟'
}

type Show = {
  sparks: boolean
  pill: boolean
  descriptions: boolean
  agentWord: boolean
  tokens: boolean
  total: boolean
  cacheWord: boolean
}

const DROP_ORDER = ['sparks', 'pill', 'descriptions', 'agentWord', 'tokens', 'total', 'cacheWord'] as const
const DESKTOP_CELL_PX = 8
const DESKTOP_GAP_PX = 12
const DESKTOP_SMALL_GAP_PX = 6
const DESKTOP_AGENT_FONT_PX = 13
const TERMINAL_GAP = 3
const TERMINAL_PADDING = 2

function cells(text: string) {
  let total = 0
  for (const ch of text) total += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1

  return total
}

function sum(parts: number[], gap: number) {
  return parts.reduce((total, part) => total + part, 0) + gap * Math.max(0, parts.length - 1)
}

function fitShow(room: number, widthOf: (show: Show) => number): Show {
  let show: Show = {
    sparks: true,
    pill: true,
    descriptions: true,
    agentWord: true,
    tokens: true,
    total: true,
    cacheWord: true,
  }
  for (const dropped of DROP_ORDER) {
    if (widthOf(show) <= room) return show
    show = { ...show, [dropped]: false }
  }

  return show
}

function cacheValue(view: CacheView) {
  if (view.kind === 'warm') return formatRemaining(view.remainingMs)
  if (view.kind === 'refreshing') return formatTtl(view.ttl)

  return view.kind === 'expired' ? '已过期' : '未缓存'
}

function cacheAlt(view: CacheView) {
  if (view.kind === 'warm') return `缓存剩余 ${formatRemaining(view.remainingMs)}，有效期 ${formatTtl(view.ttl)}`
  if (view.kind === 'refreshing') return `缓存刷新中，有效期 ${formatTtl(view.ttl)}`

  return `缓存${cacheValue(view)}`
}

function cacheGlyph(view: CacheView) {
  if (view.kind === 'refreshing') return '●'
  if (view.kind !== 'warm') return '○'

  return PIE_BLOCKS[Math.max(0, Math.min(PIE_BLOCKS.length - 1, Math.ceil(view.fraction * 4) - 1))] ?? '●'
}

function isCacheDim(view: CacheView) {
  return view.kind === 'expired' || view.kind === 'cold'
}

function cacheColor(view: CacheView): ThemeKey | undefined {
  if (isCacheDim(view)) return undefined
  if (view.kind === 'warm' && view.isLow) return 'warning'

  return 'success'
}

function toCacheDrawing(view: CacheView, value: string): CacheDrawing {
  if (view.kind === 'warm') {
    return {
      kind: view.isLow ? 'low' : 'warm',
      value,
      fraction: view.fraction,
      seconds: view.remainingMs / 1000,
    }
  }

  return {
    kind: view.kind,
    value,
    fraction: view.kind === 'refreshing' ? 1 : 0,
    seconds: 0,
  }
}

async function clearInFlight($: EngineInterface) {
  if ((await read($, cache)).inFlightSince === null) return
  await update($, cache, value => (value.inFlightSince === null ? value : { ...value, inFlightSince: null }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await clearInFlight($)
    startRefreshing($)

    return started
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost !== undefined) await recordCost($, e.cost.usd)
    requestRefresh?.()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      const response = yield* next(e)
      requestRefresh?.()

      return response
    }

    const sentAt = await $.clock.now()
    await update($, cache, value => ({ ...value, inFlightSince: sentAt }))
    let usage: TurnUsage | null = null
    try {
      const response = yield* next(e)
      usage = response.usage

      return response
    } finally {
      await update($, cache, value => settleStep(value, sentAt, usage))
      requestRefresh?.()
    }
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      await update($, cache, value => ({
        ...NO_CACHE,
        ttl: value.ttl,
        ttlSource: value.ttlSource,
      }))
    } else if (e.source === 'compact') {
      await update($, cache, value => (value.sentAt === null ? value : { ...value, isCold: true }))
    } else if (e.seconds_since_last_response !== undefined) {
      const seconds = e.seconds_since_last_response
      const lastAt = (await $.clock.now()) - seconds * 1000
      await update($, cache, value => resumed(value, lastAt, seconds, e.prompt_cache_likely_expired))
    }

    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    const isSwitched = e.from_model !== e.to_model
    await update($, cache, (value): DevBandCache => ({
      ...value,
      ttl: e.cache_ttl,
      ttlSource: 'engine',
      isCold: value.isCold || (isSwitched && value.sentAt !== null),
    }))

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    requestRefresh?.()

    return spawned
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) requestRefresh?.()

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) requestRefresh?.()
    else await clearInFlight($)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const spent = await read($, cost)
    const fill = await read($, context)
    const running = await read($, agents)
    const usd = spent.usd !== null && spent.usd > 0 ? spent.usd : null
    const now = await $.clock.now()
    const cached = toCacheView(await read($, cache), now)
    scheduleRedraw($, now, cached === null ? null : nextChangeIn(cached))
    if (fill === null && cached === null && running.length === 0 && usd === null) return next(e)

    const history = spent.history ?? []
    const latest = history.at(-1)
    const freshAt = latest !== undefined && now - latest.at < FRESH_MS ? latest.at : null
    const delta = latest !== undefined && freshAt !== null ? `+${formatUsd(latest.delta)}` : null
    const deltas = history.map(entry => entry.delta)

    const tokens = fill?.tokens === undefined ? null : `${formatTokens(fill.tokens)} / ${formatTokens(fill.window)}`
    const agentCount = `${running.length} 个子代理`
    const descriptions = running.map(agent => agent.description).join(' · ')

    const room = e.props.bodyColumns
    const agentLabel = (show: Show) => (show.agentWord ? agentCount : `${running.length}`)
    const hasSparks = deltas.length >= 2
    const cacheValueText = cached === null ? '' : cacheValue(cached)

    if (e.surface === 'terminal') {
      const show = fitShow(room, show => {
        const parts: number[] = []
        if (fill !== null) {
          parts.push(
            sum(
              [6, METER_CELLS, cells(`${fill.percent}%`), ...(show.tokens && tokens !== null ? [cells(tokens)] : [])],
              1,
            ),
          )
        }
        if (cached !== null) parts.push(sum([1, ...(show.cacheWord ? [4] : []), cells(cacheValueText)], 1))
        if (usd !== null) {
          const costParts = [
            ...(show.sparks && hasSparks ? [deltas.length] : []),
            ...(show.total ? [cells(formatUsd(usd))] : []),
            ...(show.pill && delta !== null ? [cells(delta)] : []),
          ]
          if (costParts.length > 0) parts.push(sum(costParts, 1))
        }
        if (running.length > 0) parts.push(sum([1, cells(agentLabel(show))], 1))

        return sum(parts, TERMINAL_GAP) + TERMINAL_PADDING
      })
      const { Box, Text } = $.ui.resolve(e)
      const meter = (percent: number) => {
        const color = fillColor(percent)
        const clamped = Math.min(100, Math.max(0, percent))
        const eighths = Math.round((clamped / 100) * METER_CELLS * 8)
        const full = Math.floor(eighths / 8)
        const partial = PARTIAL_BLOCKS[eighths % 8] ?? ''
        const empty = METER_CELLS - full - (partial ? 1 : 0)

        return (
          <Text wrap="truncate-end">
            <Text color={color} wrap="truncate-end">{'█'.repeat(full)}</Text>
            <Text color={color} backgroundColor="subtle" wrap="truncate-end">
              {partial}
            </Text>
            <Text backgroundColor="subtle" wrap="truncate-end">{' '.repeat(empty)}</Text>
          </Text>
        )
      }
      const max = Math.max(...deltas, 0)

      return (
        <Box flexDirection="row" alignItems="center" gap={3} paddingX={1} overflow="hidden">
          {fill === null ? null : (
            <Box flexDirection="row" gap={1} flexShrink={0}>
              <Text dimColor wrap="truncate-end">
                上下文
              </Text>
              {meter(fill.percent)}
              <Text wrap="truncate-end">{fill.percent}%</Text>
              {tokens === null || !show.tokens ? null : (
                <Text dimColor wrap="truncate-end">
                  {tokens}
                </Text>
              )}
            </Box>
          )}
          {cached === null ? null : (
            <Box flexDirection="row" gap={1} flexShrink={0}>
              <Text color={cacheColor(cached)} dimColor={cacheColor(cached) === undefined} wrap="truncate-end">
                {cacheGlyph(cached)}
              </Text>
              {show.cacheWord ? (
                <Text dimColor wrap="truncate-end">
                  缓存
                </Text>
              ) : null}
              <Text
                wrap="truncate-end"
                color={cached.kind === 'warm' && cached.isLow ? 'warning' : undefined}
                dimColor={isCacheDim(cached)}
              >
                {cacheValue(cached)}
              </Text>
            </Box>
          )}
          {usd === null || !(show.total || (show.sparks && hasSparks) || (show.pill && delta !== null)) ? null : (
            <Box flexDirection="row" gap={1} flexShrink={0}>
              {!show.sparks || !hasSparks ? null : (
                <Text wrap="truncate-end">
                  <Text dimColor wrap="truncate-end">
                    {deltas
                      .slice(0, -1)
                      .map(d => sparkBlock(d, max))
                      .join('')}
                  </Text>
                  <Text color="claude" wrap="truncate-end">{sparkBlock(deltas.at(-1) ?? 0, max)}</Text>
                </Text>
              )}
              {show.total ? <Text wrap="truncate-end">{formatUsd(usd)}</Text> : null}
              {delta === null || !show.pill ? null : (
                <Text color="claude" wrap="truncate-end">
                  {delta}
                </Text>
              )}
            </Box>
          )}
          <Box flexGrow={1} />
          {running.length === 0 ? null : (
            <Box key="agents" flexDirection="row" gap={1} flexShrink={1}>
              <Box flexShrink={0}>
                <Text color="claude" wrap="truncate-end">
                  ◐ {agentLabel(show)}
                </Text>
              </Box>
              {show.descriptions ? (
                <Box display="none" hover={{ display: 'flex' }} flexShrink={1}>
                  <Text dimColor wrap="truncate-end">
                    {descriptions}
                  </Text>
                </Box>
              ) : null}
            </Box>
          )}
        </Box>
      )
    }

    const rolling =
      usd !== null && freshAt !== null && spent.previousUsd !== null && formatUsd(spent.previousUsd) !== formatUsd(usd)
        ? { from: formatUsd(spent.previousUsd), at: freshAt }
        : null
    const show = fitShow(room * DESKTOP_CELL_PX, show => {
      const parts: number[] = []
      if (fill !== null) parts.push(meterSize.width)
      if (cached !== null) parts.push(cacheSize(cacheValueText, show.cacheWord).width)
      if (usd !== null) {
        const total = formatUsd(usd)
        const costParts = [
          ...(show.sparks && hasSparks ? [sparkSize(deltas.length).width] : []),
          ...(show.total ? [odometerSize(rolling === null ? [total] : [rolling.from, total]).width] : []),
          ...(show.pill && delta !== null ? [pillSize(delta).width] : []),
        ]
        if (costParts.length > 0) parts.push(sum(costParts, DESKTOP_SMALL_GAP_PX))
      }
      if (running.length > 0) {
        parts.push(orbitSize.width + DESKTOP_SMALL_GAP_PX + textWidth(agentLabel(show), DESKTOP_AGENT_FONT_PX))
      }

      return sum(parts, DESKTOP_GAP_PX * 2 + dividerSize.width)
    })
    const { Box, Svg, Text } = $.ui.resolve(e)
    const segments = []
    if (fill !== null) {
      segments.push(
        <Box flexShrink={0}>
          <Svg
            source={meterSvg(fill.percent, show.tokens ? tokens : null)}
            alt={
              tokens === null || !show.tokens ? `上下文已用 ${fill.percent}%` : `上下文已用 ${fill.percent}%，${tokens}`
            }
            width={meterSize.width}
            height={meterSize.height}
          />
        </Box>,
      )
    }
    if (cached !== null) {
      const value = cacheValue(cached)
      const size = cacheSize(value, show.cacheWord)
      segments.push(
        <Box flexShrink={0}>
          <Svg
            source={cacheSvg({
              ...toCacheDrawing(cached, value),
              hasLabel: show.cacheWord,
            })}
            alt={cacheAlt(cached)}
            width={size.width}
            height={size.height}
          />
        </Box>,
      )
    }
    if (usd !== null && (show.total || (show.sparks && hasSparks) || (show.pill && delta !== null))) {
      const total = formatUsd(usd)
      const odometer = odometerSize(rolling === null ? [total] : [rolling.from, total])
      segments.push(
        <Box flexDirection="row" alignItems="center" gap="sm" flexShrink={0}>
          {!show.sparks || !hasSparks ? null : (
            <Svg
              source={sparkSvg(deltas, freshAt)}
              alt={`最近 ${deltas.length} 轮的花费`}
              width={sparkSize(deltas.length).width}
              height={sparkSize(deltas.length).height}
            />
          )}
          {show.total ? (
            <Svg
              source={odometerSvg(total, rolling)}
              alt={`花费 ${total}`}
              width={odometer.width}
              height={odometer.height}
            />
          ) : null}
          {delta === null || freshAt === null || !show.pill ? null : (
            <Svg
              source={pillSvg(delta, freshAt)}
              alt={`本轮 ${delta}`}
              width={pillSize(delta).width}
              height={pillSize(delta).height}
            />
          )}
        </Box>,
      )
    }

    const agentsSegment =
      running.length === 0 ? null : (
        <Box key="agents" flexDirection="row" alignItems="center" gap="sm" flexShrink={1}>
          {show.descriptions ? (
            <Box display="none" hover={{ display: 'flex' }} flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {descriptions}
              </Text>
            </Box>
          ) : null}
          <Svg
            source={orbitSvg(running.length)}
            alt={`${agentCount}运行中`}
            width={orbitSize.width}
            height={orbitSize.height}
          />
          <Box flexShrink={0}>
            <Text tabular wrap="truncate-end">
              {agentLabel(show)}
            </Text>
          </Box>
        </Box>
      )

    return (
      <Box flexDirection="row" alignItems="center" gap="md" overflow="hidden">
        {segments.flatMap((segment, i) =>
          i === 0
            ? [segment]
            : [
                <Box flexShrink={0}>
                  <Svg source={DIVIDER_SVG} alt="|" width={dividerSize.width} height={dividerSize.height} />
                </Box>,
                segment,
              ],
        )}
        <Box flexGrow={1} />
        {agentsSegment}
      </Box>
    )
  })
}
