import { expect, test } from 'claude-code/testing'

import { mergeDays, mergePage } from '../hooks/data'
import { formatLines, mergeCalendar, mergeTotals } from '../hooks/logic'

const PAGE = {
  data: {
    search: {
      pageInfo: { hasNextPage: true, endCursor: 'Y3Vyc29yOjEwMA==' },
      nodes: [
        { mergedAt: '2026-11-05T23:30:00Z', additions: 120, deletions: 30 },
        { mergedAt: '2026-11-06T01:10:00Z', additions: 5, deletions: 2 },
        { mergedAt: '2026-11-04T10:00:00Z', additions: 40, deletions: 0 },
        { mergedAt: '2026-10-07T12:00:00Z', additions: 900, deletions: 900 },
        {},
      ],
    },
  },
}

test('a search page gives its nodes and the cursor of the next page, if there is one', async () => {
  const page = mergePage(PAGE)
  expect(page?.nodes.length).toBe(5)
  expect(page?.next).toBe('Y3Vyc29yOjEwMA==')
  expect(mergePage({ data: { search: { pageInfo: { hasNextPage: false, endCursor: 'x' }, nodes: [] } } })?.next).toBe(null)
  expect(mergePage(null)).toBe(null)
  expect(mergePage({ errors: [{ message: 'bad' }] })).toBe(null)
})

test('merges go into the local day they were merged on, and days before the window are dropped', async () => {
  const nodes = mergePage(PAGE)?.nodes ?? []

  expect(mergeDays(nodes, 0, '2026-10-08')).toEqual([
    { day: '2026-11-04', prs: 1, additions: 40, deletions: 0 },
    { day: '2026-11-05', prs: 1, additions: 120, deletions: 30 },
    { day: '2026-11-06', prs: 1, additions: 5, deletions: 2 },
  ])
  expect(mergeDays(nodes, 60, '2026-10-08')).toEqual([
    { day: '2026-11-04', prs: 1, additions: 40, deletions: 0 },
    { day: '2026-11-06', prs: 2, additions: 125, deletions: 32 },
  ])
  expect(mergeDays(nodes, -8 * 60, '2026-11-05').map(d => d.day)).toEqual(['2026-11-05'])
})

test('the merge calendar fills the days without a merge, and the totals add up', async () => {
  const days = mergeCalendar([{ day: '2026-11-05', prs: 2, additions: 10, deletions: 4 }], '2026-11-04', '2026-11-06')

  expect(days.map(d => d.prs)).toEqual([0, 2, 0])
  expect(mergeTotals(days)).toEqual({ prs: 2, additions: 10, deletions: 4 })
})

test('line counts are short', async () => {
  expect(formatLines(812)).toBe('812')
  expect(formatLines(8421)).toBe('8.4k')
  expect(formatLines(9960)).toBe('10k')
  expect(formatLines(508_073)).toBe('508k')
  expect(formatLines(999_800)).toBe('1.0M')
  expect(formatLines(2_345_678)).toBe('2.3M')
})
