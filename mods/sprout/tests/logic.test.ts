import { expect, test } from 'claude-code/testing'

import {
  FIVE_HOUR,
  HOUR_MS,
  MINUTE_MS,
  PIPS,
  SEVEN_DAY,
  forecast,
  growthStep,
  levelForTokens,
  lostStreakOf,
  moodOf,
  pipsFor,
  streakOf,
} from '../hooks/logic'

const NOW = Date.parse('2026-11-05T12:00:00Z')

test('the forecast projects the recent rate to the reset', async () => {
  const fc = forecast(
    [
      { at: NOW - 60 * MINUTE_MS, pct: 24 },
      { at: NOW - 30 * MINUTE_MS, pct: 29 },
    ],
    { pct: 34, at: NOW, resetsAt: NOW + 2 * HOUR_MS },
    FIVE_HOUR,
  )

  expect(fc.basis).toBe('recent')
  expect(Math.round(fc.projected)).toBe(54)
  expect(fc.fullAt).toBe(null)
})

test('a forecast past 100% says when the window runs out', async () => {
  const fc = forecast(
    [{ at: NOW - 24 * HOUR_MS, pct: 48 }],
    { pct: 72, at: NOW, resetsAt: NOW + 3 * 24 * HOUR_MS },
    SEVEN_DAY,
  )

  expect(Math.round(fc.projected)).toBe(144)
  expect(fc.fullAt).toBe(NOW + 28 * HOUR_MS)
})

test('with too few samples the forecast uses the average rate since the window began', async () => {
  const fc = forecast([], { pct: 20, at: NOW, resetsAt: NOW + 4 * HOUR_MS }, FIVE_HOUR)

  expect(fc.basis).toBe('average')
  expect(Math.round(fc.projected)).toBe(100)
})

test('the streak counts back from today or yesterday', async () => {
  const days = ['2026-10-20', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']

  expect(streakOf(days, '2026-11-05')).toBe(6)
  expect(streakOf(days, '2026-11-04')).toBe(6)
  expect(streakOf(days, '2026-11-06')).toBe(0)
  expect(lostStreakOf([...days, '2026-11-05'], '2026-11-05')).toBe(null)
  expect(lostStreakOf([...days, '2026-11-06'], '2026-11-06')).toBe(6)
  expect(lostStreakOf([...days, '2026-11-07'], '2026-11-07')).toBe(6)
  expect(lostStreakOf(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'], '2026-11-05')).toBe(null)
})

test('the level comes from cumulative tokens', async () => {
  expect(levelForTokens(0)).toBe(1)
  expect(levelForTokens(19.99e9)).toBe(1)
  expect(levelForTokens(20e9)).toBe(2)
  expect(levelForTokens(999e9)).toBe(8)
  expect(levelForTokens(1000e9)).toBe(9)
  expect(levelForTokens(5000e9)).toBe(9)
})

test('the pips show the way to the next level, rounded down, and are full at the top level', async () => {
  expect(pipsFor(2, 20.3e9)).toBe(0)
  expect(pipsFor(2, 27.4e9)).toBe(3)
  expect(pipsFor(2, 34.99e9)).toBe(6)
  expect(pipsFor(9, 1000e9)).toBe(PIPS)
})

test('the highest level never goes down, and the first run records it without a level-up', async () => {
  expect(growthStep(null, 40e9)).toEqual({ highest: 3, isLevelUp: false })
  expect(growthStep(2, 40e9)).toEqual({ highest: 3, isLevelUp: true })
  expect(growthStep(3, 40e9)).toEqual({ highest: 3, isLevelUp: false })
  expect(growthStep(5, 0)).toEqual({ highest: 5, isLevelUp: false })
})

test('the mood is sleep, then party, then worry, then happy', async () => {
  const calm = { five: 30, week: 40, isOverForecast: false, isCelebrating: false }

  expect(moodOf({ ...calm, five: 100, isCelebrating: true, isOverForecast: true })).toBe('sleep')
  expect(moodOf({ ...calm, isCelebrating: true, isOverForecast: true })).toBe('party')
  expect(moodOf({ ...calm, isOverForecast: true })).toBe('worry')
  expect(moodOf({ ...calm, five: 85 })).toBe('worry')
  expect(moodOf({ ...calm, week: 90 })).toBe('worry')
  expect(moodOf(calm)).toBe('happy')
})
