/** `cacheRead` and `promptTokens` (fresh input, cache reads and cache writes) are absent in scans stored before they were kept. */
export type SproutDay = { day: string; tokens: number; costUsd: number; cacheRead?: number; promptTokens?: number }

export type SproutTotals = { tokens: number; costUsd: number; cacheHitRate: number }

export type SproutScan = {
  ranAt: number
  firstDay: string | null
  days: SproutDay[]
  totals: SproutTotals
  previous: SproutTotals | null
}

export type SproutLimit = { pct: number; resetsAt: number | null }

export type SproutSample = { at: number; five?: number; week?: number }

export type SproutQuota = {
  at: number | null
  five: SproutLimit | null
  week: SproutLimit | null
  samples: SproutSample[]
}

export type SproutGithub = { fetchedAt: number; total: number; start: string; levels: string }

export type SproutMergeDay = { day: string; prs: number; additions: number; deletions: number }

/** A span of local days fetched as one search; `asOf` is the local day it was fetched on. */
export type SproutMergeChunk = { from: string; to: string; asOf: string }

/**
 * `days` holds only the local days with a merge. `from` is the first day of the unbroken run of fetched chunks
 * that ends at the newest one, and `fetchedAt` is when the chunks of the last 30 days were last fetched.
 */
export type SproutMerges = { fetchedAt: number; from: string; tzOffsetMin: number | null; chunks: SproutMergeChunk[]; days: SproutMergeDay[] }

export type SproutParty = { number: number; title: string; repo: string; until: number }

export type SproutBucket =
  | 'happy'
  | 'worry'
  | 'sleep'
  | 'party'
  | 'feed'
  | 'pat'
  | 'night'
  | 'streak'
  | 'levelup'
  | 'broken'

export type SproutLine = { bucket: SproutBucket; index: number; at: number }

export type SproutPet = {
  action: 'feed' | 'pat' | null
  actionAt: number
  line: SproutLine | null
  fed: number
  patted: number
}

export type SproutLevelUp = { level: number; until: number }

/** `highest` is the highest level reached, kept in the store so that it never goes down. */
export type SproutGrowth = { highest: number | null; levelUp: SproutLevelUp | null }

export type SproutRange = '30' | 'all'

export type SproutEnv = { repo: string | null; tzOffsetMin: number | null }

export type SproutIntroKind = 'tiles' | 'trend' | 'merges' | 'clay' | 'github'

/** Kept in the store as `introPlayed`: the local day each drawing last played its entrance, in any session. */
export type SproutIntroPlayed = Partial<Record<SproutIntroKind, string>>

declare module 'claude-code' {
  interface PluginState {
    sprout: {
      scan: Shaped<SproutScan | null>
      quota: Shaped<SproutQuota>
      github: Shaped<SproutGithub | null>
      merges: Shaped<SproutMerges | null>
      party: SproutParty | null
      pet: Shaped<SproutPet>
      range: SproutRange
      env: SproutEnv
      growth: SproutGrowth
    }
  }
}
