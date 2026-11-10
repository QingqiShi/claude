// Miao for Codex: an MCP server on stdio that Codex starts. It runs the hooks of the mod on engine.ts, and gives
// Codex two tools for the model, one for the panel, and the panel itself as an MCP App.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import { recordLimits, runScan, startSprout } from '../hooks/data'
import { langOf, t } from '../hooks/i18n'
import { levelLabel } from '../hooks/levels'
import { formatTokens } from '../hooks/logic'
import { hydrateRange, readModel, setRange } from '../hooks/model'
import { activityOf, createTailer, familyOf } from './activity'
import { createEngine } from './engine'
import { addCodexLines } from './lines'
import { ACTIONS, codexHost, interact, loadPet, observe } from './pet'
import type { Action } from './pet'
import { findCodex, limitsOf, readRateLimits } from './quota'
import { atlasHtml, panelHtml } from './view'

type Json = Record<string, any>
type Context = { threadId?: string; cwd?: string }

const PANEL = 'ui://sprout/panel.html'
const PANEL_TYPE = 'text/html;profile=mcp-app'
const QUOTA_MS = 60_000

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex')
const dataDir = join(codexHome, 'sprout')
const version = (JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8')) as { version: string }).version

let language: string | undefined
const $ = createEngine(root, dataDir, () => language)
const host = codexHost([
  join(root, 'codex/scripts/scan.mjs'),
  ...['sessions', 'archived_sessions'].flatMap(name => ['--sessions', join(codexHome, name)]),
  '--cache',
  join(dataDir, 'scan.json'),
  '--prices',
  join(dataDir, 'openai-prices.json'),
])
const tail = createTailer(codexHome)
const codex = findCodex()
let quotaAt = 0

/** Codex names the chat in the metadata of a tool call. The newest rollout file is never taken for the current chat. */
function contextOf(args: Json, meta: Json | undefined): Context {
  let turn = meta?.['x-codex-turn-metadata']
  if (typeof turn === 'string') {
    try {
      turn = JSON.parse(turn)
    } catch {
      turn = null
    }
  }
  const named = [meta?.['openai/threadId'], meta?.threadId, turn?.thread_id, args.threadId].find(id => typeof id === 'string' && id !== '')

  return { ...(named === undefined ? {} : { threadId: named as string }), ...(typeof args.cwd === 'string' && args.cwd !== '' ? { cwd: args.cwd } : {}) }
}

/** Asks Codex for the quota once a minute; when that fails, the newest reading in a rollout file stands in. */
async function refreshQuota(sessions: Awaited<ReturnType<typeof tail>>, now: number, isForced: boolean) {
  if (!isForced && now - quotaAt < QUOTA_MS) return
  quotaAt = now
  try {
    const limits = limitsOf(await readRateLimits(codex), now)
    if (limits.length > 0) return await recordLimits($, limits)
  } catch {}
  const logged = sessions
    .map(session => session.limits)
    .filter(reading => reading !== null)
    .sort((a, b) => b.at - a.at)[0]
  if (logged !== undefined) await recordLimits($, limitsOf(logged.value, logged.at), logged.at)
}

/** Takes in what Codex does now, so that the next drawing of the pet reacts to it. Returns the folder of the chat. */
async function look(context: Context, isForced = false) {
  const now = Date.now()
  const sessions = await tail(now)
  void refreshQuota(sessions, now, isForced).catch(() => {})
  if (isForced) void runScan($, host)
  const model = await readModel($, host)
  const mine = context.threadId === undefined ? sessions : familyOf(sessions, context.threadId)
  await observe($, model.quota, activityOf(mine, now), model.today)
  const cwd = sessions.find(session => session.session === context.threadId)?.cwd || context.cwd

  return cwd === undefined ? null : basename(cwd.replace(/[\\/]+$/, '')) || null
}

async function status(args: Json, context: Context) {
  await look(context, args.refresh === true)
  const model = await readModel($, host)
  const quota = model.windows.map(w => t(`${w.label}已用 ${Math.round(w.limit.pct)}%`, `${w.label}: ${Math.round(w.limit.pct)}% used`)).join(t('；', '; '))
  const usage =
    model.scan === null
      ? t('还在读取历史用量。', 'Still reading the usage history.')
      : t(`本机 Codex 累计 ${formatTokens(model.scan.totals.tokens)} token。`, `Codex on this computer: ${formatTokens(model.scan.totals.tokens)} tokens in all.`)
  const text = t(
    `小苗 ${levelLabel(model.level)}：「${model.text}」${usage}额度：${quota || '暂无读数'}。只统计这台电脑上保留的 Codex 会话。`,
    `Miao, ${levelLabel(model.level)}: "${model.text}" ${usage} Quota: ${quota || 'no reading yet'}. Only the Codex sessions kept on this computer count.`,
  )

  return { content: [{ type: 'text', text }], structuredContent: { ...context } }
}

async function act(action: unknown, context: Context) {
  if (!ACTIONS.includes(action as Action)) throw new Error(`action must be one of ${ACTIONS.join(', ')}`)
  await look(context)
  await interact($, action as Action, await readModel($, host))
}

async function view(args: Json, context: Context) {
  if (typeof args.lang === 'string') language = langOf(undefined, args.lang)
  if (args.range === '30' || args.range === 'all') await setRange($, args.range)
  if (args.action !== undefined) await act(args.action, context)
  const project = await look(context, args.refresh === true)
  const { model, sections } = await panelHtml($, host, typeof args.width === 'number' ? args.width : 400, project)

  return { content: [{ type: 'text', text: 'ok' }], structuredContent: { sections, ...(args.atlas === true ? { atlas: atlasHtml(model) } : {}) } }
}

const chat = {
  cwd: { type: 'string', description: "The working directory of the current chat, for the project name in the panel. Never the plugin's own folder." },
  threadId: { type: 'string', description: 'The id of the current chat.' },
}
const TOOLS = [
  {
    name: 'sprout_status',
    title: '打开小苗 · Open Miao',
    description:
      'Opens Miao (小苗): a pixel pet with the Codex usage of this computer, the subscription quota, merged PRs and GitHub contributions. Returns a short summary; a client with MCP Apps shows the panel.',
    inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: 'Scan the session files and ask for the quota again now.' }, ...chat } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: PANEL }, 'ui/resourceUri': PANEL, 'openai/ui': { entrypoints: [{ type: 'thread' }, { type: 'global' }] } },
  },
  {
    name: 'sprout_interact',
    title: '陪陪小苗 · Play with Miao',
    description: 'Waters (feed) or pats (pat) Miao, makes it speak (roast), prays to Tibo for rain (pray) or calls CatGPT (cat). Praying only plays an animation; it never resets a quota.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ACTIONS }, ...chat }, required: ['action'] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: PANEL }, 'ui/resourceUri': PANEL },
  },
  {
    name: 'sprout_view',
    title: 'Miao panel',
    description: 'For the Miao panel itself: draws the panel. Not for the model.',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number' },
        lang: { type: 'string' },
        range: { type: 'string', enum: ['30', 'all'] },
        action: { type: 'string', enum: ACTIONS },
        atlas: { type: 'boolean' },
        refresh: { type: 'boolean' },
        ...chat,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { visibility: ['app'] } },
  },
]

async function call(name: string, args: Json, meta: Json | undefined) {
  const context = contextOf(args, meta)
  if (name === 'sprout_status') return status(args, context)
  if (name === 'sprout_view') return view(args, context)
  if (name !== 'sprout_interact') throw new Error(`no tool named ${name}`)
  await act(args.action, context)
  const model = await readModel($, host)

  return { content: [{ type: 'text', text: t(`小苗：「${model.text}」`, `Miao: "${model.text}"`) }], structuredContent: { ...context } }
}

async function answer(method: string, params: Json): Promise<Json> {
  switch (method) {
    case 'initialize':
      return { protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'sprout', version } }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      try {
        return await call(String(params.name), (params.arguments ?? {}) as Json, params._meta as Json | undefined)
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }
      }
    case 'resources/list':
      return { resources: [{ uri: PANEL, name: 'Miao', mimeType: PANEL_TYPE }] }
    case 'resources/templates/list':
      return { resourceTemplates: [] }
    case 'resources/read':
      if (params.uri !== PANEL) throw new Error(`no resource ${String(params.uri)}`)
      return { contents: [{ uri: PANEL, mimeType: PANEL_TYPE, text: readFileSync(join(root, 'codex/panel.html'), 'utf8'), _meta: { ui: { prefersBorder: false } } }] }
    default:
      throw Object.assign(new Error(`no method ${method}`), { code: -32601 })
  }
}

addCodexLines()
await loadPet($)
await hydrateRange($)
// The scan of the mod runs with a node it finds itself. This one is known to be new enough.
await $.store.set('nodePath', process.execPath)
startSprout($, '', host)

const send = (message: Json) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
const input = createInterface({ input: process.stdin })
input.on('line', line => {
  let message: Json
  try {
    message = JSON.parse(line) as Json
  } catch {
    return
  }
  if (typeof message.method !== 'string' || message.id === undefined) return
  answer(message.method, (message.params ?? {}) as Json).then(
    result => send({ id: message.id, result }),
    (error: Error & { code?: number }) => send({ id: message.id, error: { code: error.code ?? -32603, message: error.message } }),
  )
})
input.on('close', () => process.exit(0))
