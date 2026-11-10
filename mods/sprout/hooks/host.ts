import type { SproutBucket } from '../types'
import type { Mood } from './logic'

/**
 * What differs between the apps Miao lives in. The Claude Code mod uses `claude`; `codex/` has the one for Codex.
 * The engine lets `$` go only to a function it can see, so a host holds values and plain functions, and never takes `$`.
 */
export type Host = {
  /** The arguments after `node` for the usage scan: the script, then its options. Without them the scan reads Claude Code's projects. */
  scanArgs?: readonly string[]
  /** A bucket for something only this host sees, which replaces the bucket of the mood. */
  bucketFor?(mood: Mood, isCelebrating: boolean): { key: SproutBucket; index?: number } | null
  /** More placeholders for the lines. */
  context?(): Record<string, string | number | null>
  /** The last word on a line, for a host that is not Claude Code. */
  say?(text: string): string
}

export const claude: Host = {}
