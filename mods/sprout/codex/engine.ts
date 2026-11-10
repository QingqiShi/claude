// The part of Claude Code's engine that the hooks of the mod use, made from Node.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { EngineInterface } from 'claude-code'

type Atom<T> = { key: string; initial: T }
type NodeEngine = EngineInterface & { state: Map<string, unknown> }

export function atom<T>(ref: { plugin: string; key: string }, initial: T): Atom<T> {
  return { key: `${ref.plugin}/${ref.key}`, initial }
}

export async function read<T>($: EngineInterface, state: Atom<T>): Promise<T> {
  const values = ($ as NodeEngine).state

  return values.has(state.key) ? (values.get(state.key) as T) : state.initial
}

export async function update<T>($: EngineInterface, state: Atom<T>, change: (value: T) => T | Promise<T>): Promise<T> {
  const next = await change(await read($, state))
  ;($ as NodeEngine).state.set(state.key, next)

  return next
}

/**
 * `root` is the folder of the mod. `dataDir` keeps what the engine's store keeps for Claude Code, one file for each key.
 * `language` stands in for Claude Code's language setting.
 */
export function createEngine(root: string, dataDir: string, language: () => string | undefined): EngineInterface {
  const file = (key: string) => join(dataDir, 'store', `${key}.json`)
  const timer = (start: typeof setTimeout | typeof setInterval, ms: number, run: () => void) => {
    const id = start(run, ms)
    id.unref()

    return { cancel: () => clearTimeout(id) }
  }
  const engine = {
    state: new Map<string, unknown>(),
    clock: {
      now: async () => Date.now(),
      after: (ms: number, run: () => void) => timer(setTimeout, ms, run),
      every: (ms: number, run: () => void) => timer(setInterval, ms, run),
    },
    env: { get: async (key: string) => process.env[key] ?? null },
    fs: {
      exists: async (path: string) => existsSync(path),
      list: async (path: string) => (await readdir(path, { withFileTypes: true })).map(entry => ({ name: entry.name, kind: entry.isDirectory() ? 'dir' : 'file' })),
    },
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        const response = await fetch(url, init)

        return { status: response.status, text: await response.text() }
      },
    },
    plugin: { root },
    process: {
      run: (argv: string[], options: { stdin?: string; timeoutMs?: number } = {}) =>
        new Promise<{ exitCode: number; stdout: string; stderr: string }>(resolve => {
          const child = execFile(argv[0] ?? '', argv.slice(1), { timeout: options.timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) =>
            resolve({ exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : 1, stdout, stderr }),
          )
          child.stdin?.end(options.stdin ?? '')
        }),
    },
    session: { repo: async () => null },
    settings: { read: async () => language() },
    store: {
      get: async (key: string) => {
        try {
          return JSON.parse(await readFile(file(key), 'utf8')) as unknown
        } catch {
          return undefined
        }
      },
      set: async (key: string, value: unknown) => {
        await mkdir(join(dataDir, 'store'), { recursive: true })
        const tmp = `${file(key)}.${process.pid}.tmp`
        await writeFile(tmp, JSON.stringify(value))
        await rename(tmp, file(key))
      },
      delete: async (key: string) => rm(file(key), { force: true }),
    },
    ui: {
      invalidate: () => {},
      toast: () => {},
      log: (text: string) => {
        if (process.env.SPROUT_DEBUG) console.error(text)
      },
    },
  }

  return engine as unknown as EngineInterface
}
