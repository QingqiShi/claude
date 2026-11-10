// What Codex is doing now, read from the end of the rollout files it is writing. Only the kind of each event,
// its time and its counts are kept: never a prompt, a command or its output.
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type WorkEvent = 'compact' | 'test_failed' | 'test_passed' | 'done' | 'interrupted' | 'approval'

export type Activity = {
  active: number
  agents: number
  startedAt: number | null
  isPlanning: boolean
  event: { kind: WorkEvent; at: number; failures: number } | null
}

export type SessionState = {
  session: string
  parent: string
  cwd: string
  isAgent: boolean
  turn: string
  startedAt: number
  updatedAt: number
  isActive: boolean
  isPlanning: boolean
  failures: number
  approvals: number
  event: Activity['event']
  lastItem: string
  /** The newest quota reading in the file, as Codex wrote it. */
  limits: { at: number; value: unknown } | null
}

type Json = Record<string, any>

const FRESH_MS = 5 * 60_000
const EVENT_MS = 90_000
const TAIL_BYTES = 512 * 1024
const HEAD_BYTES = 256 * 1024
const RELEVANT = /session_meta|turn_context|compacted|task_started|task_complete|turn_aborted|item_completed|token_count/

export const freshSession = (): SessionState => ({
  session: '',
  parent: '',
  cwd: '',
  isAgent: false,
  turn: '',
  startedAt: 0,
  updatedAt: 0,
  isActive: false,
  isPlanning: false,
  failures: 0,
  approvals: 0,
  event: null,
  lastItem: '',
  limits: null,
})

const RUNNERS = ['npm', 'pnpm', 'yarn', 'bun'].join('|')
const TEST_COMMAND = new RegExp(
  `^\\s*(?:(?:${RUNNERS})\\s+(?:run\\s+)?(?:test(?::[\\w-]+)?|check|lint|typecheck|build)\\b|(?:npx\\s+)?(?:vitest|jest|tsc|pytest)\\b|python[\\d.]*\\s+-m\\s+(?:pytest|unittest)\\b|(?:cargo|go)\\s+test\\b|node\\s+(?:--\\S+\\s+)*--test\\b)`,
)

/** A pipe, a second command or a heredoc can hide the exit code of the test, so such a command does not count. */
function isTestCommand(command: unknown) {
  const text = (Array.isArray(command) ? String(command.at(-1) ?? '') : typeof command === 'string' ? command : '').trim()
  if (text.includes('<<') || /[;\n|]/.test(text)) return false

  return text.split('&&').every(part => TEST_COMMAND.test(part))
}

export function consumeRecord(state: SessionState, record: Json) {
  const p = record.payload as Json | undefined
  if (!p || typeof p !== 'object') return
  const at = Date.parse(record.timestamp)
  if (record.type === 'session_meta') {
    // The file of a sub-agent has a copy of its parent's session_meta after its own.
    if (state.session !== '') return
    state.session = String(p.id ?? p.session_id ?? '')
    state.isAgent = !!p.source?.subagent
    state.parent = typeof p.source?.subagent?.thread_spawn?.parent_thread_id === 'string' ? p.source.subagent.thread_spawn.parent_thread_id : ''
    if (typeof p.cwd === 'string') state.cwd = p.cwd
    return
  }
  if (!Number.isFinite(at) || at < state.updatedAt) return
  if (record.type === 'turn_context') {
    if (typeof p.cwd === 'string') state.cwd = p.cwd
    return
  }
  const event = (kind: WorkEvent) => {
    state.event = { kind, at, failures: state.failures }
  }
  if (record.type === 'compacted') {
    event('compact')
    state.updatedAt = at
    return
  }
  if (record.type !== 'event_msg') return
  if (p.type === 'task_started') {
    if (state.turn !== p.turn_id) Object.assign(state, { failures: 0, approvals: 0, event: null })
    Object.assign(state, { turn: String(p.turn_id ?? ''), startedAt: at, isActive: true, isPlanning: String(p.collaboration_mode_kind).toLowerCase() === 'plan' })
  } else if (p.type === 'task_complete' || p.type === 'turn_aborted') {
    if (p.turn_id && state.turn && p.turn_id !== state.turn) return
    state.isActive = false
    if (p.type === 'turn_aborted') event('interrupted')
    else if (!state.event || at - state.event.at > 60_000) event('done')
  } else if (p.type === 'item_completed') {
    const item = (p.item ?? {}) as Json
    if (item.id && item.id === state.lastItem) return
    state.lastItem = String(item.id ?? '')
    const type = String(item.type).toLowerCase()
    if (type === 'contextcompaction') event('compact')
    if (type === 'commandexecution' && isTestCommand(item.command)) {
      const exit = item.exit_code ?? item.exitCode
      if (typeof exit === 'number' && exit !== 0) {
        state.failures++
        event('test_failed')
      }
      if (exit === 0 && state.failures > 0) {
        event('test_passed')
        state.failures = 0
      }
    }
    if (type === 'mcptoolcall' && /request_user_input/.test(String(item.tool)) && ++state.approvals >= 2) event('approval')
  } else if (p.type === 'token_count') {
    if (p.rate_limits && typeof p.rate_limits === 'object') state.limits = { at, value: p.rate_limits }
  } else return
  state.updatedAt = at
}

/** A chat and the sub-agents it started, and theirs. */
export function familyOf(sessions: readonly SessionState[], thread: string) {
  const family = new Set([thread])
  for (let size = 0; size !== family.size; ) {
    size = family.size
    for (const s of sessions) if (s.parent && family.has(s.parent)) family.add(s.session)
  }

  return sessions.filter(s => family.has(s.session))
}

export function activityOf(sessions: readonly SessionState[], now: number): Activity {
  // A fork copies the history of its parent. The same turn in two files is one worker.
  const byTurn = new Map<string, SessionState>()
  for (const s of sessions) {
    const key = s.turn || s.session
    if (key && (byTurn.get(key)?.updatedAt ?? -1) < s.updatedAt) byTurn.set(key, s)
  }
  const current = [...byTurn.values()].filter(s => s.updatedAt <= now && now - s.updatedAt < FRESH_MS)
  const active = current.filter(s => s.isActive)
  const event =
    current
      .map(s => s.event)
      .filter((e): e is NonNullable<Activity['event']> => e !== null && e.at <= now && now - e.at < EVENT_MS)
      .sort((a, b) => b.at - a.at)[0] ?? null

  return {
    active: active.length,
    agents: active.filter(s => s.isAgent).length,
    startedAt: active.length > 0 ? Math.min(...active.map(s => s.startedAt)) : null,
    isPlanning: active.some(s => s.isPlanning),
    event,
  }
}

async function readSpan(path: string, from: number, to: number) {
  const file = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(Math.max(0, to - from))
    const { bytesRead } = await file.read(buffer, 0, buffer.length, from)

    return buffer.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

function consumeLines(state: SessionState, text: string) {
  for (const line of text.split('\n')) {
    if (!RELEVANT.test(line.slice(0, 2048))) continue
    try {
      consumeRecord(state, JSON.parse(line) as Json)
    } catch {}
  }
}

/** The day folders Codex wrote to last: sessions/<year>/<month>/<day>. */
async function newestDays(sessions: string, count: number) {
  const newest = async (dir: string, n: number) => {
    try {
      return (await readdir(dir))
        .filter(name => /^\d+$/.test(name))
        .sort()
        .slice(-n)
    } catch {
      return []
    }
  }
  const days: string[] = []
  for (const year of (await newest(sessions, 2)).reverse()) {
    for (const month of (await newest(join(sessions, year), 2)).reverse()) {
      for (const day of (await newest(join(sessions, year, month), count)).reverse()) {
        days.push(join(sessions, year, month, day))
        if (days.length === count) return days
      }
    }
  }

  return days
}

export function createTailer(codexHome: string) {
  const files = new Map<string, { offset: number; state: SessionState }>()

  /** The sessions written in the last minutes. Each call reads only what the files gained since the call before. */
  return async function tail(now: number): Promise<SessionState[]> {
    const live = new Set<string>()
    for (const dir of await newestDays(join(codexHome, 'sessions'), 2)) {
      let names: string[] = []
      try {
        names = await readdir(dir)
      } catch {}
      for (const name of names) {
        if (!name.endsWith('.jsonl')) continue
        const path = join(dir, name)
        try {
          const info = await stat(path)
          if (now - info.mtimeMs > FRESH_MS) continue
          live.add(path)
          let entry = files.get(path)
          if (entry === undefined || info.size < entry.offset) {
            entry = { offset: Math.max(0, info.size - TAIL_BYTES), state: freshSession() }
            files.set(path, entry)
            consumeLines(entry.state, (await readSpan(path, 0, Math.min(info.size, HEAD_BYTES))).toString('utf8').split('\n')[0] ?? '')
          }
          if (info.size <= entry.offset) continue
          const chunk = await readSpan(path, entry.offset, info.size)
          const end = chunk.lastIndexOf(10)
          if (end < 0) continue
          consumeLines(entry.state, chunk.subarray(0, end).toString('utf8'))
          entry.offset += end + 1
        } catch {}
      }
    }
    for (const path of files.keys()) if (!live.has(path)) files.delete(path)

    return [...files.values()].map(entry => entry.state)
  }
}
