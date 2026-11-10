import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

import { activityOf, consumeRecord, familyOf, freshSession } from '../activity.ts'
import { limitsOf } from '../quota.ts'

type Json = Record<string, any>

const at = (ms: number) => new Date(Date.parse('2026-11-10T12:00:00Z') + ms).toISOString()
const event = (ms: number, payload: Json) => ({ timestamp: at(ms), type: 'event_msg', payload })
const command = (ms: number, id: string, text: string, exit: number) =>
  event(ms, { type: 'item_completed', item: { id, type: 'commandExecution', command: ['zsh', '-lc', text], exit_code: exit } })

test('a failed test command counts up, and the next one that passes says so; a piped command does not count', () => {
  const session = freshSession()
  const kinds = (...records: Json[]) => {
    for (const record of records) consumeRecord(session, record)
    return [session.event?.kind, session.event?.failures]
  }
  consumeRecord(session, event(0, { type: 'task_started', turn_id: 't1' }))
  assert.deepEqual(kinds(command(1, 'a', 'pnpm test | tail', 1)), [undefined, undefined])
  assert.deepEqual(kinds(command(2, 'b', 'pnpm test', 1), command(3, 'c', 'cargo test', 101)), ['test_failed', 2])
  assert.deepEqual(kinds(command(4, 'd', 'pnpm lint && pnpm test', 0)), ['test_passed', 2])
  assert.deepEqual(kinds(event(5, { type: 'task_complete', turn_id: 't1' })), ['test_passed', 2])
  assert.equal(session.isActive, false)
})

test("a chat sees its own sub-agents, and a sub-agent's file is not taken for its parent", () => {
  const now = Date.parse(at(10_000))
  const parent = freshSession()
  const child = freshSession()
  const other = freshSession()
  consumeRecord(parent, { type: 'session_meta', timestamp: at(0), payload: { id: 'parent', cwd: '/work/app', source: 'vscode' } })
  consumeRecord(child, { type: 'session_meta', timestamp: at(0), payload: { id: 'child', source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } } } })
  consumeRecord(child, { type: 'session_meta', timestamp: at(0), payload: { id: 'parent', source: 'vscode' } })
  consumeRecord(other, { type: 'session_meta', timestamp: at(0), payload: { id: 'other', source: 'vscode' } })
  for (const [session, turn] of [[parent, 'p'], [child, 'c'], [other, 'o']] as const) consumeRecord(session, event(1000, { type: 'task_started', turn_id: turn }))

  assert.deepEqual(activityOf(familyOf([parent, child, other], 'parent'), now), { active: 2, agents: 1, startedAt: Date.parse(at(1000)), isPlanning: false, event: null })
  assert.equal(activityOf([parent, child, other], now + 6 * 60_000).active, 0, 'a session with no new record for minutes is not at work')
})

test('the quota reads the same from the app-server and from a rollout file', () => {
  const now = Date.parse(at(0))
  const live = { rateLimitsByLimitId: { other: { limitId: 'other', primary: { usedPercent: 99, windowDurationMins: 300 } }, codex: { limitId: 'codex', primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1794318022 }, secondary: { usedPercent: 8, windowDurationMins: 10080, resetsInSeconds: 60 } } } }
  const logged = { limit_id: 'codex', primary: { used_percent: 12, window_minutes: 300, resets_at: 1794318022 }, secondary: { used_percent: 8, window_minutes: 10080, resets_at: at(60_000) }, credits: {} }
  const expected = [
    { kind: 'five_hour', percentUsed: 12, resetsAt: new Date(1794318022000).toISOString() },
    { kind: 'seven_day', percentUsed: 8, resetsAt: at(60_000) },
  ]
  assert.deepEqual(limitsOf(live, now), expected)
  assert.deepEqual(limitsOf(logged, now), expected)
  assert.deepEqual(limitsOf({ primary: { used_percent: 5, window_minutes: 60 } }, now), [], 'a window that is not 5 hours or a week has no place in the pane')
})

test('Codex can list the tools, read the panel, draw it and play with the pet over stdio', async () => {
  const home = mkdtempSync(join(tmpdir(), 'sprout-codex-'))
  const day = join(home, 'sessions/2026/11/10')
  mkdirSync(day, { recursive: true })
  const usage = { input_tokens: 2_000_000, cached_input_tokens: 1_500_000, output_tokens: 10_000 }
  writeFileSync(
    join(day, 'rollout-a.jsonl'),
    [
      { type: 'session_meta', timestamp: new Date().toISOString(), payload: { id: 'thread-a', cwd: '/work/my-app' } },
      { timestamp: new Date().toISOString(), type: 'token_usage_record', payload: { thread_id: 'thread-a', response_id: 'r1', usage } },
    ]
      .map(record => JSON.stringify(record))
      .join('\n') + '\n',
  )
  const server = spawn('sh', [join(import.meta.dirname, '../run.sh')], { env: { ...process.env, CODEX_HOME: home, LANG: 'en_US.UTF-8' }, stdio: ['pipe', 'pipe', 'inherit'] })
  const waiting = new Map<number, (message: Json) => void>()
  createInterface({ input: server.stdout }).on('line', line => {
    const message = JSON.parse(line) as Json
    waiting.get(message.id)?.(message)
  })
  let id = 0
  const rpc = (method: string, params: Json = {}) =>
    new Promise<Json>(resolve => {
      waiting.set(++id, message => resolve(message.result))
      server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  const tool = (name: string, args: Json = {}) => rpc('tools/call', { name, arguments: args })
  try {
    assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).serverInfo.name, 'sprout')
    const { tools } = await rpc('tools/list')
    assert.deepEqual(tools.map((t: Json) => t.name), ['sprout_status', 'sprout_interact', 'sprout_view'])
    const uri = tools[0]._meta.ui.resourceUri
    const panel = (await rpc('resources/read', { uri })).contents[0]
    assert.equal(panel.mimeType, 'text/html;profile=mcp-app')
    assert.match(panel.text, /ui\/initialize/)

    const drawn = async (args: Json = {}) => (await tool('sprout_view', { width: 400, lang: 'en-GB', threadId: 'thread-a', ...args })).structuredContent
    let view = await drawn()
    for (let tries = 0; !view.sections.some((s: Json) => s.key === 'stats') && tries < 100; tries++) {
      await new Promise(resolve => setTimeout(resolve, 200))
      view = await drawn()
    }
    const html = (key: string) => view.sections.find((s: Json) => s.key === key)?.html ?? ''
    assert.match(html('stats'), /2\.0M tokens/, 'the tokens of the session file reach the tiles')
    assert.match(html('pet'), /data-action="roast"[^>]*>Roast me</)
    assert.match(html('header'), />my-app</, 'the header names the folder of the chat')

    assert.match((await tool('sprout_interact', { action: 'pray' })).content[0].text, /Tibo|rain|reset/i)
    assert.match((await drawn({ atlas: true })).atlas, /Lv9/)
    assert.equal((await tool('sprout_interact', { action: 'dance' })).isError, true)
  } finally {
    server.kill()
    rmSync(home, { recursive: true, force: true })
  }
})
