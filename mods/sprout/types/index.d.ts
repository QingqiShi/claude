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
  | 'visitFeed'
  | 'visitPat'

/** `count`, on a visitor line, is how many times visitors watered or patted since the pet last said so. */
export type SproutLine = { bucket: SproutBucket; index: number; at: number; count?: number }

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

/** The Buddy account and machine this Mac uploads as; `server` is the origin it connected to. */
export type SproutBuddyLink = { server: string; user: string; machine: string; name: string; connectedAt: number }

/** A connect request the person is confirming in the browser; polled every `intervalMs` until `expiresAt`. */
export type SproutConnect = { server: string; requestId: string; code: string; url: string; expiresAt: number; intervalMs: number }

/** Kept in the store as `buddyUpload`, shared by every session on this Mac: the last upload's time and the hash of its data. */
export type SproutUpload = { at: number; hash: string }

export type SproutBuddyError = 'unauthorized' | 'network'

export type SproutBuddy = {
  /** Null until the Mac's key and `node` are found; false where there is no Keychain. */
  isReady: boolean | null
  link: SproutBuddyLink | null
  connect: SproutConnect | null
  upload: SproutUpload | null
  error: SproutBuddyError | null
  /** A short word on the last connect attempt, shown once in the pane. */
  note: string | null
  isOfferHidden: boolean
}

/** How often visitors watered and patted the pet on its Buddy page. */
export type SproutVisitorCounts = { fed: number; patted: number }

/**
 * Kept in the store as `buddyVisitors`, shared by every session on this Mac: the counts Buddy last told, the counts
 * the pet already reacted to, and when Buddy told them.
 */
export type SproutVisitors = SproutVisitorCounts & { seenFed: number; seenPatted: number; at: number }

/** What the account's other Macs uploaded to Buddy, pulled back so that the pane shows every Mac's total. */
export type SproutOthers = { fetchedAt: number; firstDay: string | null; days: SproutDay[] }

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
      buddy: Shaped<SproutBuddy>
      others: Shaped<SproutOthers | null>
      visitors: Shaped<SproutVisitors | null>
    }
  }
}
