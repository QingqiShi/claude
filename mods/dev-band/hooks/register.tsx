import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, ThemeKey } from 'claude-code'

import type { DevBandAgent, DevBandContext, DevBandCostEntry } from '../types'
import {
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
} from './svg'

const cost = atom(
  { plugin: 'dev-band', key: 'cost' } as const,
  { usd: null, previousUsd: null, history: [] },
  { shape: 'cost-1' },
)
const context = atom({ plugin: 'dev-band', key: 'context' } as const, null)
const agents = atom({ plugin: 'dev-band', key: 'agents' } as const, [])

const AGENT_POLL_MS = 3000
const FRESH_MS = 6000
const HISTORY_SIZE = 12
const METER_CELLS = 12
const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

let requestRefresh: (() => void) | null = null

const ACTIVE_STATUSES = new Set(['pending', 'running', 'waiting'])

function toContext(usage: SessionContextUsage | undefined, limit: number | null): DevBandContext | null {
  if (!usage || usage.tokens === undefined) return null
  const window = limit ?? usage.window
  if (window <= 0) return null

  return { percent: Math.round((usage.tokens / window) * 100), tokens: usage.tokens, window }
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

    return { usd, previousUsd: value.usd, history: [...(value.history ?? []), entry].slice(-HISTORY_SIZE) }
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
          compactWindow = { model: usage.context.window, limit: await readCompactWindow($) }
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    startRefreshing($)

    return started
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost !== undefined) await recordCost($, e.cost.usd)
    requestRefresh?.()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    requestRefresh?.()

    return response
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

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const spent = await read($, cost)
    const fill = await read($, context)
    const running = await read($, agents)
    const usd = spent.usd !== null && spent.usd > 0 ? spent.usd : null
    if (fill === null && running.length === 0 && usd === null) return next(e)

    const history = spent.history ?? []
    const latest = history.at(-1)
    const now = await $.clock.now()
    const freshAt = latest !== undefined && now - latest.at < FRESH_MS ? latest.at : null
    const delta = latest !== undefined && freshAt !== null ? `+${formatUsd(latest.delta)}` : null
    const deltas = history.map(entry => entry.delta)

    const tokens =
      fill?.tokens === undefined ? null : `${formatTokens(fill.tokens)} / ${formatTokens(fill.window)}`
    const agentCount = `${running.length} ${running.length === 1 ? 'agent' : 'agents'}`
    const descriptions = running.map(agent => agent.description).join(' · ')

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const meter = (percent: number) => {
        const color = fillColor(percent)
        const clamped = Math.min(100, Math.max(0, percent))
        const eighths = Math.round((clamped / 100) * METER_CELLS * 8)
        const full = Math.floor(eighths / 8)
        const partial = PARTIAL_BLOCKS[eighths % 8] ?? ''
        const empty = METER_CELLS - full - (partial ? 1 : 0)

        return (
          <Text>
            <Text color={color}>{'█'.repeat(full)}</Text>
            <Text color={color} backgroundColor="subtle">
              {partial}
            </Text>
            <Text backgroundColor="subtle">{' '.repeat(empty)}</Text>
          </Text>
        )
      }
      const max = Math.max(...deltas, 0)

      return (
        <Box flexDirection="row" alignItems="center" gap={3} paddingX={1} overflow="hidden">
          {fill === null ? null : (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>context</Text>
              {meter(fill.percent)}
              <Text>{fill.percent}%</Text>
              {tokens === null ? null : <Text dimColor>{tokens}</Text>}
            </Box>
          )}
          {usd === null ? null : (
            <Box flexDirection="row" gap={1}>
              {deltas.length < 2 ? null : (
                <Text>
                  <Text dimColor>{deltas.slice(0, -1).map(d => sparkBlock(d, max)).join('')}</Text>
                  <Text color="claude">{sparkBlock(deltas.at(-1) ?? 0, max)}</Text>
                </Text>
              )}
              <Text>{formatUsd(usd)}</Text>
              {delta === null ? null : <Text color="claude">{delta}</Text>}
            </Box>
          )}
          <Box flexGrow={1} />
          {running.length === 0 ? null : (
            <Box key="agents" flexDirection="row" gap={1} flexShrink={1}>
              <Text color="claude">◐ {agentCount}</Text>
              <Box display="none" hover={{ display: 'flex' }} flexShrink={1}>
                <Text dimColor wrap="truncate-end">
                  {descriptions}
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const segments = []
    if (fill !== null) {
      segments.push(
        <Svg
          source={meterSvg(fill.percent, tokens)}
          alt={tokens === null ? `Context ${fill.percent}% used` : `Context ${fill.percent}% used, ${tokens}`}
          width={meterSize.width}
          height={meterSize.height}
        />,
      )
    }
    if (usd !== null) {
      const total = formatUsd(usd)
      const rolling =
        freshAt !== null && spent.previousUsd !== null && formatUsd(spent.previousUsd) !== total
          ? { from: formatUsd(spent.previousUsd), at: freshAt }
          : null
      const odometer = odometerSize(rolling === null ? [total] : [rolling.from, total])
      segments.push(
        <Box flexDirection="row" alignItems="center" gap="sm">
          {deltas.length < 2 ? null : (
            <Svg
              source={sparkSvg(deltas, freshAt)}
              alt={`Cost of the last ${deltas.length} turns`}
              width={sparkSize(deltas.length).width}
              height={sparkSize(deltas.length).height}
            />
          )}
          <Svg
            source={odometerSvg(total, rolling)}
            alt={`Cost ${total}`}
            width={odometer.width}
            height={odometer.height}
          />
          {delta === null || freshAt === null ? null : (
            <Svg
              source={pillSvg(delta, freshAt)}
              alt={`${delta} this turn`}
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
          <Box display="none" hover={{ display: 'flex' }} flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {descriptions}
            </Text>
          </Box>
          <Svg
            source={orbitSvg(running.length)}
            alt={`${agentCount} running`}
            width={orbitSize.width}
            height={orbitSize.height}
          />
          <Text tabular>{agentCount}</Text>
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
