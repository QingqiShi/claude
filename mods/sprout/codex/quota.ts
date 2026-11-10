// The quota of the Codex account: asked from the Codex CLI's app-server, or taken from a reading in a rollout file.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

import type { SessionRateLimit } from 'claude-code'

type Json = Record<string, any>

/** The desktop app does not always have the person's shell PATH, so look beside this node and in the usual folders. */
export function findCodex() {
  const candidates = [join(dirname(process.execPath), 'codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(homedir(), '.local/bin/codex')]

  return candidates.find(path => existsSync(path)) ?? 'codex'
}

export function readRateLimits(binary: string, timeoutMs = 12_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] })
    const reader = createInterface({ input: child.stdout })
    let isDone = false
    const finish = (error: Error | null, result?: unknown) => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      reader.close()
      child.stdin.end()
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1000).unref()
      if (error === null) resolve(result)
      else reject(error)
    }
    const timer = setTimeout(() => finish(new Error('the Codex app-server did not answer')), timeoutMs)
    const send = (message: Json) => child.stdin.write(`${JSON.stringify(message)}\n`)
    child.stdin.on('error', () => finish(new Error('the Codex app-server closed')))
    child.on('error', () => finish(new Error('the Codex CLI was not found')))
    child.on('exit', () => finish(new Error('the Codex app-server closed')))
    reader.on('line', line => {
      let message: Json
      try {
        message = JSON.parse(line) as Json
      } catch {
        return
      }
      if (message.id !== 1 && message.id !== 2) return
      if (message.error) finish(new Error('this Codex account has no quota to read'))
      else if (message.id === 1) {
        send({ method: 'initialized' })
        send({ id: 2, method: 'account/rateLimits/read' })
      } else finish(null, message.result)
    })
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'sprout', title: 'Sprout', version: '1' }, capabilities: null } })
  })
}

/**
 * The 5-hour and the weekly window of the `codex` limit, in the shape the pane keeps for Claude Code.
 * The app-server answers in camelCase and a rollout file in snake_case; this reads both.
 */
export function limitsOf(raw: unknown, readAt: number): SessionRateLimit[] {
  if (!raw || typeof raw !== 'object') return []
  const value = raw as Json
  const buckets: Json[] = value.rateLimitsByLimitId ? Object.values(value.rateLimitsByLimitId) : [value.rateLimits ?? value]
  const bucket = buckets.find(b => (b?.limitId ?? b?.limit_id) === 'codex') ?? buckets[0]
  const limits: SessionRateLimit[] = []
  for (const name of ['primary', 'secondary']) {
    const window = bucket?.[name] as Json | undefined
    const percentUsed = window?.usedPercent ?? window?.used_percent
    const minutes = window?.windowDurationMins ?? window?.window_minutes
    const kind = minutes === 300 ? 'five_hour' : minutes === 10080 ? 'seven_day' : null
    if (kind === null || typeof percentUsed !== 'number' || !Number.isFinite(percentUsed) || percentUsed < 0) continue
    const reset = window?.resetsAt ?? window?.resets_at
    const relative = window?.resetsInSeconds ?? window?.resets_in_seconds
    const resetsAt =
      typeof reset === 'number' && reset > 0
        ? reset * 1000
        : typeof reset === 'string'
          ? Date.parse(reset)
          : typeof relative === 'number' && relative >= 0
            ? readAt + relative * 1000
            : NaN
    limits.push({ kind, percentUsed, ...(Number.isFinite(resetsAt) ? { resetsAt: new Date(resetsAt).toISOString() } : {}) })
  }

  return limits
}
