import { expect, test } from 'claude-code/testing'

import type { UploadInput } from '../hooks/buddy'
import { UPLOAD_EVERY_MS, machineName, normalizeServer, parseOthers, shouldUpload, uploadBodyOf, uploadHashOf, withOthers } from '../hooks/buddy'
import type { SproutScan } from '../types'

const NOW = Date.parse('2026-11-07T06:00:00Z')

const SCAN: SproutScan = {
  ranAt: NOW,
  firstDay: '2026-11-05',
  days: [
    { day: '2026-11-05', tokens: 1000.4, costUsd: 0.5, cacheRead: 800, promptTokens: 900 },
    { day: '2026-11-06', tokens: 2000, costUsd: 1 },
  ],
  totals: { tokens: 3000, costUsd: 1.5, cacheHitRate: 0.9 },
  previous: null,
}

const INPUT: UploadInput = {
  at: NOW,
  tzOffsetMin: 480,
  scan: SCAN,
  quota: { at: NOW, five: { pct: 12.5, resetsAt: NOW + 3_600_000 }, week: null, samples: [{ at: NOW - 60_000, five: 10 }, { at: NOW, five: 12.5 }] },
  github: { fetchedAt: NOW, total: 12, start: '2025-11-02', levels: '0123' },
  merges: {
    fetchedAt: NOW,
    from: '2026-10-09',
    tzOffsetMin: 480,
    chunks: [{ from: '2026-10-09', to: '2026-10-22', asOf: '2026-11-07' }],
    days: [{ day: '2026-11-06', prs: 2, additions: 40, deletions: 3 }],
  },
  party: { number: 3459, title: 'feat(ui): move the fill behind the cards', repo: 'QingqiShi/shiqingqi.com', until: NOW + 60_000 },
  growth: { highest: 3, levelUp: { level: 3, until: NOW + 60_000 } },
  pet: { action: 'feed', actionAt: NOW, line: { bucket: 'feed', index: 2, at: NOW }, fed: 5, patted: 7 },
}

test('the upload carries only what the page shows: no repository, title, chunk or pet line leaves the Mac', async () => {
  const body = uploadBodyOf(INPUT)

  expect(body).toEqual({
    v: 1,
    at: NOW,
    tzOffsetMin: 480,
    firstDay: '2026-11-05',
    days: [
      { day: '2026-11-05', tokens: 1000, costUsd: 0.5, cacheRead: 800, promptTokens: 900 },
      { day: '2026-11-06', tokens: 2000, costUsd: 1 },
    ],
    quota: { at: NOW, five: { pct: 12.5, resetsAt: NOW + 3_600_000 }, week: null, samples: [{ at: NOW - 60_000, five: 10 }, { at: NOW, five: 12.5 }] },
    github: { fetchedAt: NOW, total: 12, start: '2025-11-02', levels: '0123' },
    merges: { from: '2026-10-09', days: [{ day: '2026-11-06', prs: 2, additions: 40, deletions: 3 }] },
    party: { number: 3459, until: NOW + 60_000 },
    growth: { highest: 3, levelUp: { level: 3, until: NOW + 60_000 } },
    pet: { fed: 5, patted: 7 },
  })
  expect(JSON.stringify(body)).not.toMatch(/shiqingqi|feat\(ui\)|chunks|title|repo|line/)
})

test('an empty Mac uploads nulls, and merges without a first day are left out', async () => {
  const body = uploadBodyOf({
    ...INPUT,
    scan: null,
    quota: { at: null, five: null, week: null, samples: [] },
    github: null,
    merges: { fetchedAt: 0, from: '', tzOffsetMin: null, chunks: [], days: [] },
    party: null,
    growth: { highest: null, levelUp: null },
  })

  expect(body.firstDay).toBe(null)
  expect(body.days).toEqual([])
  expect(body.quota).toBe(null)
  expect(body.github).toBe(null)
  expect(body.merges).toBe(null)
  expect(body.party).toBe(null)
})

test('uploads are at most one in five minutes per Mac, and only when the data changed', async () => {
  const hash = uploadHashOf(uploadBodyOf(INPUT))

  expect(uploadHashOf(uploadBodyOf({ ...INPUT, at: NOW + 1 }))).toBe(hash)
  expect(uploadHashOf(uploadBodyOf({ ...INPUT, pet: { ...INPUT.pet, fed: 6 } }))).not.toBe(hash)
  expect(shouldUpload(null, NOW, hash)).toBe(true)
  expect(shouldUpload({ at: NOW - UPLOAD_EVERY_MS, hash: 'other' }, NOW, hash)).toBe(true)
  expect(shouldUpload({ at: NOW - UPLOAD_EVERY_MS + 1, hash: 'other' }, NOW, hash)).toBe(false)
  expect(shouldUpload({ at: NOW - 24 * 3_600_000, hash }, NOW, hash)).toBe(false)
})

test('the other Macs’ days add to this Mac’s, and the cache rate is known only where every part is', async () => {
  const merged = withOthers(SCAN, {
    fetchedAt: NOW,
    firstDay: '2026-11-01',
    days: [
      { day: '2026-11-01', tokens: 100, costUsd: 0.1, cacheRead: 50, promptTokens: 100 },
      { day: '2026-11-05', tokens: 500, costUsd: 0.2, cacheRead: 100, promptTokens: 100 },
    ],
  })

  expect(merged?.firstDay).toBe('2026-11-01')
  expect(merged?.days).toEqual([
    { day: '2026-11-01', tokens: 100, costUsd: 0.1, cacheRead: 50, promptTokens: 100 },
    { day: '2026-11-05', tokens: 1500.4, costUsd: 0.7, cacheRead: 900, promptTokens: 1000 },
    { day: '2026-11-06', tokens: 2000, costUsd: 1 },
  ])
  expect(Math.round((merged?.totals.tokens ?? 0) * 10)).toBe(36004)
  expect(merged?.totals.cacheHitRate).toBe(0.9)
  expect(withOthers(SCAN, null)).toBe(SCAN)
  expect(withOthers(null, { fetchedAt: NOW, firstDay: null, days: [{ day: '2026-11-01', tokens: 1, costUsd: 0 }] })?.totals.tokens).toBe(1)
})

test('a server setting is kept as an origin, and anything else falls back', async () => {
  expect(normalizeServer('https://buddy-git-feat-buddy-app-tuja-labs.vercel.app/')).toBe('https://buddy-git-feat-buddy-app-tuja-labs.vercel.app')
  expect(normalizeServer(' http://localhost:3675/u/qingqi ')).toBe('http://localhost:3675')
  expect(normalizeServer('buddy.qingqi.dev')).toBe(null)
  expect(normalizeServer('file:///etc/passwd')).toBe(null)
  expect(normalizeServer(undefined)).toBe(null)
})

test('the Mac’s name is one clean line', async () => {
  expect(machineName(' Fancy MacBook Pro\n')).toBe('Fancy MacBook Pro')
  expect(machineName('a\u0007b')).toBe('a b')
  expect(machineName('')).toBe('Mac')
  expect(machineName('x'.repeat(80)).length).toBe(64)
})

test('what Buddy answers for the other Macs is read as days, and anything else as nothing', async () => {
  expect(parseOthers({ firstDay: '2026-11-01', days: [{ day: '2026-11-01', tokens: 5, costUsd: 0.1 }, { bad: true }] }, NOW)).toEqual({
    fetchedAt: NOW,
    firstDay: '2026-11-01',
    days: [{ day: '2026-11-01', tokens: 5, costUsd: 0.1 }],
  })
  expect(parseOthers({ error: 'unauthorized' }, NOW)).toBe(null)
})
