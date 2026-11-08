import type { EngineInterface } from 'claude-code'

import { HOUR_MS } from './logic'

const TOOL_RETRY_MS = HOUR_MS

type Tool = { path: string | null; checkedAt: number }

let node: Tool | null = null
let gh: Tool | null = null

export function note($: EngineInterface, text: string) {
  try {
    $.ui.log(`sprout: ${text}`, { to: 'debug' })
  } catch {}
}

async function runs($: EngineInterface, argv: string[], check: (stdout: string) => boolean) {
  try {
    const result = await $.process.run(argv, { timeoutMs: 10_000 })
    return result.exitCode === 0 && check(result.stdout)
  } catch {
    return false
  }
}

function versionDesc(a: string, b: string) {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }

  return 0
}

export async function homeDir($: EngineInterface) {
  return (await $.env.get('HOME')) ?? null
}

/** The desktop app does not always have the person's shell PATH, so look where version managers put node. */
export async function findNode($: EngineInterface, now: number) {
  if (node !== null && (node.path !== null || now - node.checkedAt < TOOL_RETRY_MS)) return node.path
  const home = await homeDir($)
  const candidates: string[] = []
  const remembered = await $.store.get('nodePath')
  if (typeof remembered === 'string') candidates.push(remembered)
  candidates.push('node', '/opt/homebrew/bin/node', '/usr/local/bin/node')
  if (home !== null) {
    try {
      const listed = await $.fs.list(`${home}/.nvm/versions/node`)
      const versions = listed.filter(entry => entry.kind === 'dir').map(entry => entry.name)
      for (const version of versions.sort(versionDesc)) candidates.push(`${home}/.nvm/versions/node/${version}/bin/node`)
    } catch {}
    candidates.push(`${home}/.volta/bin/node`, `${home}/.local/share/mise/shims/node`, `${home}/.asdf/shims/node`)
  }
  candidates.push('/usr/bin/node')
  const isModern = (stdout: string) => Number(/^v(\d+)/.exec(stdout.trim())?.[1] ?? 0) >= 18
  for (const path of [...new Set(candidates)]) {
    if (await runs($, [path, '--version'], isModern)) {
      node = { path, checkedAt: now }
      if (path !== remembered) await $.store.set('nodePath', path)
      return path
    }
  }
  node = { path: null, checkedAt: now }
  note($, 'no node found; usage stats are off')

  return null
}

export async function findGh($: EngineInterface, now: number) {
  if (gh !== null && (gh.path !== null || now - gh.checkedAt < TOOL_RETRY_MS)) return gh.path
  for (const path of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']) {
    if (await runs($, [path, '--version'], stdout => stdout.includes('gh version'))) {
      gh = { path, checkedAt: now }
      return path
    }
  }
  gh = { path: null, checkedAt: now }

  return null
}

