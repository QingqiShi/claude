// What the pet does only in Codex: it prays to Tibo for rain, CatGPT visits, it has enough of water and pats,
// it greets you after days away, and it reacts to the work Codex does.
import type { EngineInterface } from 'claude-code'

import type { SproutBucket, SproutQuota } from '../types'
import type { Host } from '../hooks/host'
import type { Mood } from '../hooks/logic'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../hooks/logic'
import type { Model } from '../hooks/model'
import { press, talk } from '../hooks/model'
import type { Activity } from './activity'
import type { CodexBucket } from './lines'
import { say } from './lines'
import type { SceneEffect, SceneExtras } from './scene'

export const ACTIONS = ['feed', 'pat', 'roast', 'pray', 'cat'] as const
export type Action = (typeof ACTIONS)[number]

type Seen = { pct: number; at: number }

/** Kept in the store as `codex`, so that a restart does not replay the rain or the return. */
export type CodexPet = {
  burst: { action: 'feed' | 'pat'; count: number; at: number } | null
  prayedAt: number
  cat: { until: number; day: string } | null
  nextCatAt: number
  seenAt: number
  returnUntil: number
  rainUntil: number
  quotaSeen: { five?: Seen; week?: Seen }
}

const BURST_MS = 12_000
const BURST_SHOW_MS = 2800
const PRAY_MS = 4000
const VISIT_MS = 90_000
const SHOW_MS = MINUTE_MS
const AWAY_MS = 2 * DAY_MS
const LONG_TASK_MS = 2 * MINUTE_MS
const IDLE: Activity = { active: 0, agents: 0, startedAt: null, isPlanning: false, event: null }

const fresh = (): CodexPet => ({ burst: null, prayedAt: 0, cat: null, nextCatAt: 0, seenAt: 0, returnUntil: 0, rainUntil: 0, quotaSeen: {} })

let pet = fresh()
let activity = IDLE
let clock = 0

const bucket = (key: CodexBucket) => key as unknown as SproutBucket

export async function loadPet($: EngineInterface) {
  const stored = await $.store.get('codex')
  pet = { ...fresh(), ...(typeof stored === 'object' && stored !== null ? (stored as Partial<CodexPet>) : {}) }
}

/** A window that was at least half used and comes back nearly empty has reset. */
function hasReset(before: Seen | undefined, now: Seen) {
  return before !== undefined && now.at > before.at && now.at - before.at < 8 * DAY_MS && before.pct >= 50 && now.pct <= 20 && before.pct - now.pct >= 40
}

/** Call before each drawing: it takes in the quota and the work of the moment, and starts the rain, the return and the cat. */
export async function observe($: EngineInterface, quota: SproutQuota, work: Activity, today: string) {
  const now = await $.clock.now()
  const before = JSON.stringify(pet)
  activity = work
  clock = now
  if (quota.at !== null && now - quota.at < 5 * MINUTE_MS) {
    for (const kind of ['five', 'week'] as const) {
      const limit = quota[kind]
      if (limit === null) continue
      const reading = { pct: limit.pct, at: quota.at }
      if (hasReset(pet.quotaSeen[kind], reading)) pet.rainUntil = now + SHOW_MS
      if ((pet.quotaSeen[kind]?.at ?? 0) < reading.at) pet.quotaSeen = { ...pet.quotaSeen, [kind]: reading }
    }
  }
  if (pet.seenAt > 0 && now - pet.seenAt >= AWAY_MS) pet.returnUntil = now + SHOW_MS
  if (now - pet.seenAt >= MINUTE_MS) pet.seenAt = now
  if (pet.nextCatAt === 0) pet.nextCatAt = now + MINUTE_MS
  else if (now >= pet.nextCatAt && pet.cat?.day !== today) {
    pet.cat = { day: today, until: now + VISIT_MS }
    pet.nextCatAt = now + 24 * HOUR_MS
  }
  if (JSON.stringify(pet) !== before) await $.store.set('codex', pet)
}

export async function interact($: EngineInterface, action: Action, model: Model) {
  const now = await $.clock.now()
  if (action === 'feed' || action === 'pat') {
    const count = pet.burst?.action === action && now - pet.burst.at < BURST_MS ? pet.burst.count + 1 : 1
    pet.burst = { action, count, at: now }
    await press($, action)
    if (count >= 3) await talk($, bucket(action === 'feed' ? 'overwater' : 'overpat'))
  } else if (action === 'roast') {
    pet.prayedAt = 0
    await talk($, model.moodKey)
  } else if (action === 'pray') {
    pet.prayedAt = now
    await talk($, bucket('pray'))
  } else {
    pet.cat = { day: model.today, until: now + VISIT_MS }
    pet.nextCatAt = now + 24 * HOUR_MS
    await talk($, bucket('cat'))
  }
  await $.store.set('codex', pet)
}

function bucketFor(mood: Mood, isCelebrating: boolean): { key: SproutBucket; index?: number } | null {
  if (pet.rainUntil > clock && mood !== 'sleep') return { key: bucket('reset') }
  if (mood === 'sleep' || isCelebrating) return null
  const work = activity.event
  // The lines of a failed test get harsher with each failure.
  if (work !== null) return { key: bucket(work.kind), ...(work.kind === 'test_failed' ? { index: Math.min(2, Math.max(0, work.failures - 1)) } : {}) }
  if (pet.returnUntil > clock) return { key: bucket('return') }
  if (activity.agents > 0 && activity.active > 1) return { key: bucket('agents') }
  if (activity.startedAt !== null && clock - activity.startedAt >= LONG_TASK_MS) return { key: bucket(activity.isPlanning ? 'planning' : 'busy') }

  return null
}

const EFFECTS: Partial<Record<CodexBucket, SceneEffect>> = {
  reset: 'rain',
  compact: 'compact',
  test_passed: 'flower',
  test_failed: 'fail',
  return: 'return',
  agents: 'agents',
  busy: 'cup',
  planning: 'cup',
}

/** What the scene shows on top of the pane's own drawing, and the mood it takes for it. */
export function sceneOf(model: Model): { mood: Mood; extras: SceneExtras } {
  const now = model.now
  const burst = pet.burst !== null && now - pet.burst.at < BURST_SHOW_MS ? pet.burst : null
  let effect: SceneEffect = EFFECTS[model.moodKey as unknown as CodexBucket] ?? null
  if (now - pet.prayedAt < PRAY_MS) effect = 'pray'
  if (burst !== null && burst.count >= 3) effect = burst.action === 'feed' ? 'umbrella' : 'hide'
  else if (burst !== null && burst.count === 2) effect = burst.action === 'feed' ? 'burp' : 'guard'
  if (effect === null && model.local.hour < 5) effect = 'blanket'

  return {
    mood: effect === 'rain' || effect === 'pray' || effect === 'flower' ? 'party' : model.mood,
    extras: { effect, cat: (pet.cat?.until ?? 0) > now, canPray: model.mood === 'worry' || model.mood === 'sleep', agents: activity.agents },
  }
}

/** The Codex side of the mod's host: where its usage comes from and what its pet says. */
export function codexHost(scanArgs: readonly string[]): Host {
  return {
    scanArgs,
    bucketFor,
    context: () => ({ agents: activity.active, failures: activity.event?.failures ?? 0 }),
    say,
  }
}
