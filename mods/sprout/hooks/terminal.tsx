import type { Elements } from 'claude-code'

import type { SproutDay, SproutMergeDay, SproutRange } from '../types'
import { levelInfo, levelLabel } from './levels'
import type { Mood } from './logic'
import { PIPS, dayFromNumber, dayNumber, formatLines, formatTokens, mergeTotals, weekdayOf, wrapText } from './logic'
import type { LevelOn } from './panels'
import { CLAY, GREEN, LEVELS as METER, levelOf, movingAverage, trendStats } from './panels'
import type { Cells, Pixels, Rgb, Scheme } from './raster'
import {
  DEFAULT,
  INKS,
  MERGE_INKS,
  backgroundAt,
  blankCells,
  cellWidth,
  cellsOf,
  cellsOfChar,
  encodeCells,
  mix,
  pixelAt,
  pixels,
  putText,
  rgb,
  setCell,
  setPixel,
} from './raster'
import { BODY, COLORS, INK, PAPER, SPARKLES, bodyPixel, skyPalette } from './scene'

type El = Elements['terminal']

export type TerminalWindow = {
  label: string
  pct: number
  projected: number | null
  reset: string
  sentence: string | null
}

export type TerminalTiles = {
  tokensLabel: string
  tokens: number
  costUsd: string
  todayUsd: string | null
  streak: number
  week: boolean[]
  cacheHitRate: number
  bars: number[]
}

export type TerminalView = {
  width: number
  scheme: Scheme
  title: string
  repo: string
  pet: { mood: Mood; action: 'feed' | 'pat' | null; isConfetti: boolean; level: number; pips: number; isDay: boolean; text: string }
  quota: { windows: TerminalWindow[]; note: string | null }
  stats: { heading: string; range: SproutRange; tiles: TerminalTiles } | null
  trend: readonly SproutDay[]
  merges: { days: readonly SproutMergeDay[]; heading: string } | null
  usage: { levelOn: LevelOn; heading: string } | null
  github: { levelOn: LevelOn; heading: string } | null
  today: string
  /** The rows the docked pane's body has, or null where the frame fits the tree. */
  rows: number | null
  on: { feed: () => void; pat: () => void; sass: () => void; range: (range: SproutRange) => void }
}

const BLACK = 0x000000
const WHITE = 0xffffff
const SEED_SINK = 6
const PET_X = 2
const BUBBLE_ROWS = 3
const BUBBLE_MIN_INNER = 12
const BUBBLE_MAX_INNER = 24
const PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const CHART_ROWS = 5
const HEAT_WEEKS = 53
const TWO_TILES_MIN = 44

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function hex(color: Rgb) {
  return `#${color.toString(16).padStart(6, '0')}`
}

function raster(R: El['Raster'], key: string, cells: Cells) {
  return <R key={key} columns={cells.columns} rows={cells.rows} cells={encodeCells(cells)} />
}

type Bubble = { x: number; row: number; width: number; lines: string[] }

type Scene = { cells: Cells; bubble: Bubble | null; plate: { row: number; color: Rgb; label: string } }

/** The pet's day or night scene in half-block pixels, as the desktop draws it in SVG. */
export function sceneCells(pet: TerminalView['pet'], width: number, isShortSky = false): Scene {
  const level = levelInfo(pet.level)
  const C = level.crown.length
  const sink = level.isSeed === true ? SEED_SINK : 0
  const petRows = C + BODY.length - sink
  const height = Math.max(20, petRows + 7 + ((petRows + 7) % 2)) - (isShortSky ? 2 : 0)
  const ground = height - 3
  const isWorry = pet.mood === 'worry'
  const sky = skyPalette(pet.isDay, isWorry)
  const p = pixels(width, height)
  const random = rng(11)
  const top = rgb(sky.top)
  const bottom = rgb(sky.bottom)
  const petCx = PET_X + 8

  for (let y = 0; y < height; y++) {
    const color = y >= ground ? rgb(sky.ground) : mix(top, bottom, y / (ground - 1))
    for (let x = 0; x < width; x++) {
      const dx = (x - petCx) / 11
      const dy = (y - ground) / 7
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy))
      setPixel(p, x, y, y < ground && glow > 0 ? mix(color, rgb(sky.glow), glow * (pet.isDay ? 0.45 : 0.35)) : color)
    }
  }

  const light = rgb(sky.light)
  const lx = width - 8
  if (pet.isDay) {
    const sun = ['.###.', '#####', '#####', '#####', '.###.']
    sun.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && setPixel(p, lx + x, 2 + y, light)))
    for (const [x, y] of [[2, 0], [2, 8], [-2, 4], [6, 4], [-1, 1], [5, 1], [-1, 7], [5, 7]] as const) setPixel(p, lx + x, y, light)
    setPixel(p, lx + 1, 3, rgb('#FFF7D1'))
    const cloud = (cx: number, cy: number, shape: readonly string[]) =>
      shape.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const under = pixelAt(p, cx + x, cy + y)
          if (ch === '#' && under !== null) setPixel(p, cx + x, cy + y, mix(under, rgb(sky.cloud), 0.92))
        }),
      )
    cloud(Math.round(width * 0.36), 1, ['....###...', '.#######..', '##########'])
    cloud(Math.round(width * 0.62), 5, ['..##...', '######.'])
  } else {
    for (let i = 0; i < 18; i++) {
      const x = Math.round(random() * (width - 1))
      const y = Math.round(random() * (ground - 6))
      setPixel(p, x, y, rgb('#FFF6D6'))
    }
    const moon = ['.###.', '#####', '#####', '#####', '.###.']
    moon.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && setPixel(p, lx + x, 2 + y, light)))
    for (const [x, y] of [[2, 0], [3, 0], [3, 1], [4, 1], [2, 1], [3, 2], [4, 2]] as const) setPixel(p, lx + x, 2 + y, top)
    if (!isWorry) {
      for (let i = 0; i < 4; i++) setPixel(p, Math.round(random() * (width - 1)), ground - 3 - Math.round(random() * 5), rgb('#E9FF8A'))
    }
  }

  for (let x = 0; x < width; x += 4) {
    const tall = 1 + Math.round(random())
    for (let k = 1; k <= tall; k++) setPixel(p, x, ground - k, rgb(sky.tuft))
  }

  if (pet.isConfetti) {
    const colors = ['#F472B6', '#FCD34D', '#8FD17A', '#7DD3FC', '#FB923C']
    const scatter = rng(29)
    for (let i = 0; i < 16; i++) setPixel(p, Math.round(scatter() * (width - 1)), Math.round(scatter() * (ground - 2)), rgb(colors[i % colors.length]!))
  }

  const lift = pet.action === 'pat' ? 1 : 0
  const y0 = ground - (C + BODY.length) + sink - lift
  const put = (x: number, y: number, color: string | null) => {
    if (color === null || y0 + y >= ground) return
    setPixel(p, PET_X + x, y0 + y, rgb(color))
  }
  if (level.isGold === true && pet.mood !== 'sleep') {
    for (const [x, y] of SPARKLES) put(Math.round(x), Math.round(y), '#FFE9A8')
  }
  level.crown.forEach((row, y) => [...row].forEach((ch, x) => put(x, y, COLORS[ch] ?? null)))
  if (level.hasBird === true) {
    for (const [x, y] of [[12, -1], [13, -1], [12, 0], [13, 0]] as const) put(x, y, '#60A5FA')
    put(14, 0, '#F59E0B')
    put(13, -1, '#0B1020')
  }
  const body = bodyPixel(pet.mood)
  BODY.forEach((row, y) => [...row].forEach((ch, x) => put(x, C + y, body(ch, x, y) ?? (ch === 'E' ? COLORS.E! : null))))
  if (level.hasPetals === true) {
    const fall = rng(53)
    for (let i = 0; i < 5; i++) put(Math.round(-2 + fall() * 20), Math.round(C + fall() * 10), '#F9A8D4')
  }
  if (pet.mood === 'worry') {
    put(15, C + 1, '#7DD3FC')
    put(15, C + 2, '#38BDF8')
  }
  if (pet.action === 'feed') {
    const heart = (x: number, y: number, fill: string) => {
      for (const [dx, dy] of [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]] as const) put(x + dx, y + dy, fill)
    }
    heart(-1, C - 1, '#F472B6')
    heart(14, C - 3, '#F9A8D4')
    for (const x of [6, 9, 11]) put(x, -3, '#7DD3FC')
  }

  const bubble = bubbleOf(p, pet.text, y0 + C + 4, ground)
  const cells = cellsOf(p)
  if (pet.mood === 'sleep') {
    const row = Math.max(1, Math.floor((y0 + C) / 2))
    const col = PET_X + 15
    const letters: Array<[number, number, string]> = [
      [col, row, 'z'],
      [col + 2, row - 1, 'z'],
      [col + 3, row - 2, 'Z'],
    ]
    for (const [x, r, ch] of letters) setCell(cells, x, r, ch, rgb('#E8F1FF'), backgroundAt(cells, x, r))
  }

  const plateRow = cells.rows - 1
  const plate = mix(rgb(sky.ground), BLACK, 0.32)
  const label = levelLabel(pet.level)
  const pipsAt = 3 + cellWidth(label)
  const plateEnd = Math.min(width - 1, pipsAt + PIPS * 3)
  for (let x = 1; x < plateEnd; x++) setCell(cells, x, plateRow, ' ', DEFAULT, plate)
  for (let i = 0; i < PIPS; i++) {
    const color = i < pet.pips ? rgb('#8FD17A') : mix(plate, WHITE, 0.22)
    if (pipsAt + i * 3 + 1 < plateEnd) {
      setCell(cells, pipsAt + i * 3, plateRow, '━', color, plate)
      setCell(cells, pipsAt + i * 3 + 1, plateRow, '━', color, plate)
    }
  }

  return { cells, bubble, plate: { row: plateRow, color: plate, label } }
}

/** Draws the speech bubble frame into the sky; the words go over it as text, since a Raster cell takes no CJK. */
function bubbleOf(p: Pixels, text: string, faceY: number, ground: number): Bubble | null {
  const right = p.columns - 3
  const left = PET_X + 20
  const maxInner = Math.min(BUBBLE_MAX_INNER, right - left - 3)
  if (maxInner < BUBBLE_MIN_INNER) return null
  const { rows: lines, isCut } = wrapText(text, maxInner, BUBBLE_ROWS, cellsOfChar)
  if (lines.length === 0 || isCut) return null
  const inner = Math.max(...lines.map(cellWidth))
  const x0 = left
  const x1 = left + inner + 3
  const lastRow = Math.floor((ground - 3) / 2)
  const row = lastRow - lines.length - 1
  if (row < 0) return null
  const top = row * 2 + 1
  const bottom = (lastRow) * 2
  const ink = rgb(INK)
  const paper = rgb(PAPER)
  const shade = (x: number, y: number) => {
    const under = pixelAt(p, x, y)
    if (under !== null) setPixel(p, x, y, mix(under, BLACK, 0.28))
  }
  for (let y = top + 1; y <= bottom + 1; y++) shade(x1 + 1, y)
  for (let x = x0 + 1; x <= x1; x++) shade(x, bottom + 1)
  for (let y = top; y <= bottom; y++) {
    for (let x = x0; x <= x1; x++) {
      const isEdgeX = x === x0 || x === x1
      const isEdgeY = y === top || y === bottom
      if (isEdgeX && isEdgeY) continue
      setPixel(p, x, y, isEdgeX || isEdgeY ? ink : paper)
    }
  }
  const t = Math.max(top + 2, Math.min(bottom - 2, faceY))
  setPixel(p, x0, t, paper)
  setPixel(p, x0 - 1, t, paper)
  setPixel(p, x0 - 2, t, ink)
  setPixel(p, x0 - 1, t - 1, ink)
  setPixel(p, x0 - 1, t + 1, ink)

  return { x: x0 + 2, row: row + 1, width: inner, lines }
}

/** One row: the fill as a gradient, the forecast hatched up to where it lands, rounded ends. */
export function meterCells(width: number, pct: number, projected: number | null, scheme: Scheme): Cells {
  const ink = INKS[scheme]
  const level = METER[levelOf(pct, projected)]
  const from = rgb(level.from)
  const to = rgb(level.to)
  const cells = blankCells(width, 1)
  const n = width - 2
  const eighths = Math.round((n * 8 * Math.min(100, Math.max(0, pct))) / 100)
  const full = Math.floor(eighths / 8)
  const partial = PARTIAL[eighths % 8] ?? ''
  const fillEnd = full + (partial === '' ? 0 : 1)
  const fc = projected === null ? null : Math.max(pct, projected)
  const isOver = fc !== null && fc > 100
  const fcEnd = fc === null ? fillEnd : Math.max(fillEnd, Math.round((n * Math.min(100, fc)) / 100))
  const hatch = mix(isOver ? rgb('#FB7185') : from, ink.track, 0.3)
  const colorAt = (i: number) => mix(from, to, full <= 1 ? 0 : i / (full - 1))

  setCell(cells, 0, 0, '▐', eighths > 0 ? from : ink.track, DEFAULT)
  setCell(cells, width - 1, 0, '▌', ink.track, DEFAULT)
  for (let i = 0; i < n; i++) {
    const x = i + 1
    if (i < full) setCell(cells, x, 0, ' ', DEFAULT, colorAt(i))
    else if (i === full && partial !== '') setCell(cells, x, 0, partial, colorAt(i), ink.track)
    else if (i < fcEnd) setCell(cells, x, 0, '╱', hatch, ink.track)
    else setCell(cells, x, 0, ' ', DEFAULT, ink.track)
  }

  const label = `${Math.round(pct)}%`
  const end = fc === null || pct >= 100 ? '' : `→ ${Math.round(fc)}%`
  const labelAt = full >= label.length + 2 ? 2 : fillEnd + 2
  putText(cells, labelAt, 0, label, full >= label.length + 2 ? rgb(level.ink) : ink.text)
  const endAt = width - 2 - [...end].length
  if (end !== '' && endAt > labelAt + label.length + 1) {
    ;[...end].forEach((ch, i) => {
      const x = endAt + i
      const isOnFill = x <= full
      putText(cells, x, 0, ch, isOnFill ? rgb(level.ink) : isOver ? rgb('#FDA4AF') : ink.dim, isOnFill ? undefined : ink.track)
    })
  }

  return cells
}

/** Spreads the days over `width` columns: a column shows the days that fall in it, with a gap column between days that have room. */
function columnsOf<T>(items: readonly T[], width: number) {
  const n = items.length
  const columns: Array<{ items: T[]; isGap: boolean; isLast: boolean }> = []
  if (n === 0) return columns
  if (n <= width) {
    const slot = Math.floor(width / n)
    for (let x = 0; x < width; x++) {
      const i = Math.min(n - 1, Math.floor((x * n) / width))
      const end = Math.floor(((i + 1) * width) / n)
      columns.push({ items: [items[i]!], isGap: slot >= 2 && x === end - 1, isLast: i === n - 1 })
    }
    return columns
  }
  for (let x = 0; x < width; x++) {
    const from = Math.floor((x * n) / width)
    const to = Math.floor(((x + 1) * n) / width)
    columns.push({ items: items.slice(from, Math.max(from + 1, to)), isGap: false, isLast: x === width - 1 })
  }

  return columns
}

export function trendCells(days: readonly SproutDay[], width: number, scheme: Scheme, rows = CHART_ROWS): Cells {
  const ink = INKS[scheme]
  const height = rows * 2
  const p = pixels(width, height)
  const average = movingAverage(days.map(d => d.tokens))
  const indexed = days.map((d, i) => ({ tokens: d.tokens, average: average[i] ?? 0 }))
  const columns = columnsOf(indexed, width)
  const max = Math.max(1, ...days.map(d => d.tokens))
  const yOf = (v: number) => height - 1 - Math.round((v / max) * (height - 1))
  const line = columns.map(c => yOf(Math.max(...c.items.map(d => d.average))))
  columns.forEach((c, x) => {
    const tokens = Math.max(...c.items.map(d => d.tokens))
    const bar = c.isGap || tokens <= 0 ? 0 : Math.max(1, Math.round((tokens / max) * height))
    const ly = line[x]!
    for (let y = 0; y < height; y++) {
      const isBar = y >= height - bar
      const area = y > ly ? 0.3 * (1 - (y - ly) / (height - ly)) : 0
      if (isBar) setPixel(p, x, y, mix(ink.bar, ink.clay, area))
      else if (area > 0.08) setPixel(p, x, y, mix(ink.bg, ink.clay, area))
    }
    const prev = line[x - 1] ?? ly
    for (let y = Math.min(prev, ly); y <= Math.max(prev, ly); y++) {
      if (y === ly || x > 0) setPixel(p, x, y, ink.clay)
    }
  })

  return cellsOf(p)
}

export function mergeCells(days: readonly SproutMergeDay[], width: number, scheme: Scheme, rows = CHART_ROWS): Cells {
  const ink = INKS[scheme]
  const colors = MERGE_INKS[scheme]
  const height = rows * 2
  const p = pixels(width, height)
  const columns = columnsOf(days, width).map(c => ({ ...c, sum: mergeTotals(c.items) }))
  const peak = Math.sqrt(Math.max(0, ...columns.map(c => c.sum.additions + c.sum.deletions)))
  const prMax = Math.max(1, ...columns.map(c => c.sum.prs))
  const cells = blankCells(width, rows + 1)
  columns.forEach((c, x) => {
    const total = c.sum.additions + c.sum.deletions
    if (c.isGap || total <= 0 || peak <= 0) return
    const strength = c.isLast ? 1 : 0.72
    const add = mix(ink.bg, rgb(colors.add), strength)
    const del = mix(ink.bg, rgb(colors.del), strength)
    const h = Math.max(1, Math.round((Math.sqrt(total) / peak) * height))
    const green = c.sum.deletions === 0 ? h : Math.round((h * c.sum.additions) / total)
    for (let k = 0; k < h; k++) setPixel(p, x, height - 1 - k, k < green ? add : del)
  })
  const bars = cellsOf(p)
  cells.words.set(bars.words)
  columns.forEach((c, x) => {
    if (c.isGap) return
    const share = c.sum.prs / prMax
    const dot = c.sum.prs === 0 ? (c.isLast ? '○' : '') : share < 0.34 ? '·' : share < 0.67 ? '•' : '●'
    if (dot !== '') setCell(cells, x, rows, dot, mix(ink.bg, rgb(colors.pr), c.isLast ? 1 : 0.85), DEFAULT)
  })

  return cells
}

export function heatColors(scheme: Scheme, ramp: typeof CLAY) {
  const ink = INKS[scheme]
  const levels = [ink.empty, ...ramp[scheme].map(rgb)]

  return { levels, before: mix(ink.bg, ink.empty, 0.35) }
}

/** Each day is `scale` pixels square: twice as large once a whole year fits at that size. */
export function heatGrid(width: number) {
  const scale = width >= HEAT_WEEKS * 2 ? 2 : 1

  return { scale, weeks: Math.min(HEAT_WEEKS, Math.floor(width / scale)) }
}

export function heatCells(levelOn: LevelOn, today: string, width: number, scheme: Scheme, ramp: typeof CLAY): Cells {
  const { scale, weeks } = heatGrid(width)
  const { levels, before } = heatColors(scheme, ramp)
  const todayN = dayNumber(today)
  const startN = todayN - weekdayOf(today) - (weeks - 1) * 7
  const p = pixels(weeks * scale, 7 * scale)
  for (let c = 0; c < weeks; c++) {
    for (let r = 0; r < 7; r++) {
      const dn = startN + c * 7 + r
      if (dn > todayN) continue
      const level = levelOn(dn)
      const color = level === null ? before : (levels[level] ?? levels[0]!)
      for (let k = 0; k < scale * scale; k++) setPixel(p, c * scale + (k % scale), r * scale + Math.floor(k / scale), color)
    }
  }

  return cellsOf(p)
}

/** The month names over the weeks they start in, as the desktop places them, in terminal cells. */
export function monthRow(today: string, weeks: number, scale: number) {
  const todayN = dayNumber(today)
  const startN = todayN - weekdayOf(today) - (weeks - 1) * 7
  const starts: Array<{ x: number; label: string }> = []
  for (let c = 0; c < weeks; c++) {
    const first = Array.from({ length: 7 }, (_, r) => dayFromNumber(startN + c * 7 + r)).find(day => day.endsWith('-01'))
    if (first !== undefined) starts.push({ x: c * scale, label: `${Number(first.slice(5, 7))}月` })
  }
  const place = (labels: typeof starts) => {
    let free = 0
    const placed: typeof starts = []
    for (const { x, label } of labels) {
      const at = Math.min(x, weeks * scale - cellWidth(label))
      if (at < free) continue
      placed.push({ x: at, label })
      free = at + cellWidth(label) + 1
    }
    return placed
  }
  const every = place(starts)
  const shown = every.length === starts.length ? every : place(starts.filter((_, i) => (starts.length - 1 - i) % 2 === 0))
  let row = ''
  for (const { x, label } of shown) row += ' '.repeat(Math.max(0, x - cellWidth(row))) + label

  return row
}

function spark(value: number, max: number) {
  if (value <= 0) return ' '

  return SPARKS[Math.min(7, Math.max(0, Math.round((value / max) * 7)))]!
}

/**
 * How the pane saves rows when the body has too few, in steps. Each step keeps what the steps before it took away:
 * - `isTight`: no gap under the title, the quota windows' labels take the place of the quota heading,
 *   the trend figures go on the trend heading;
 * - `isOneLegend`: one legend under the GitHub map for both maps; `isShortSky`: a row less of sky;
 * - `chartRows`: the trend and merge charts' height; `hasButtonsGap`: a gap over the pet buttons;
 * - `isFlatTiles`: tiles with no frames;
 * - `isTerse`: no forecast sentence unless it warns, no month row over the GitHub map.
 */
type Fit = {
  isTight: boolean
  isOneLegend: boolean
  isShortSky: boolean
  chartRows: number
  hasButtonsGap: boolean
  isFlatTiles: boolean
  isTerse: boolean
}

const ROOMY: Fit = {
  isTight: false,
  isOneLegend: false,
  isShortSky: false,
  chartRows: CHART_ROWS,
  hasButtonsGap: true,
  isFlatTiles: false,
  isTerse: false,
}

const STEPS: ReadonlyArray<Partial<Fit>> = [
  { isTight: true },
  { isOneLegend: true, isShortSky: true, chartRows: CHART_ROWS - 1 },
  { chartRows: CHART_ROWS - 2, hasButtonsGap: false },
  { isFlatTiles: true },
  { isTerse: true },
]

const FITS = STEPS.reduce<Fit[]>((fits, step) => [...fits, { ...fits.at(-1)!, ...step }], [ROOMY])

/** The roomiest drawing that fits the body's rows, or the tightest, which then scrolls. */
export function terminalPane(el: El, view: TerminalView) {
  const room = view.rows
  if (room === null) return paneTree(el, view, FITS[0]!)
  for (const fit of FITS.slice(0, -1)) {
    const tree = paneTree(el, view, fit)
    if (treeRows(tree, view.width) <= room) return tree
  }

  return paneTree(el, view, FITS.at(-1)!)
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }

function flat(children: unknown): unknown[] {
  if (Array.isArray(children)) return children.flatMap(flat)

  return children === null || children === undefined || typeof children === 'boolean' ? [] : [children]
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)

  return flat((node as Node).children).map(textOf).join('')
}

/** The rows a tree takes in `width` columns, as Ink lays out the elements this pane draws. */
export function treeRows(node: unknown, width: number): number {
  if (typeof node !== 'object' || node === null) return 0
  const { type, props = {}, children } = node as Node
  if (type === 'Raster') return Number(props.rows)
  if (type === 'Button') return 1
  if (type === 'Text') {
    if (String(props.wrap ?? 'wrap').startsWith('truncate')) return 1
    return Math.max(1, wrapText(textOf(node), width, Infinity, cellsOfChar).rows.length)
  }
  if (typeof props.height === 'number') return props.height
  const border = props.borderStyle === undefined ? 0 : 2
  const inner = (typeof props.width === 'number' ? props.width : width) - border - 2 * Number(props.paddingX ?? 0)
  const kids = flat(children).filter(k => (k as Node).props?.position !== 'absolute')
  const rows = kids.map(k => treeRows(k, inner))
  const body =
    props.flexDirection === 'row'
      ? Math.max(0, ...rows)
      : rows.reduce((sum, n) => sum + n, 0) + Number(props.gap ?? 0) * Math.max(0, kids.length - 1)

  return body + border
}

function paneTree(el: El, view: TerminalView, fit: Fit) {
  const { Box, Text, Button, Raster } = el
  const W = view.width
  const ink = INKS[view.scheme]
  const clay = hex(ink.clay)
  const head = (left: string, right: JSX.Element | null) => (
    <Box flexDirection="row" justifyContent="space-between" gap={1} width={W}>
      <Text dimColor wrap="truncate-end">
        {left}
      </Text>
      {right}
    </Box>
  )

  const scene = sceneCells(view.pet, W, fit.isShortSky)
  const bubble = scene.bubble
  const petPart = (
    <Box flexDirection="column">
      <Box flexDirection="column" width={W} height={scene.cells.rows}>
        {raster(Raster, 'scene', scene.cells)}
        {bubble === null ? null : (
          <Box position="absolute" top={bubble.row} left={bubble.x} flexDirection="column">
            {bubble.lines.map(line => (
              <Text color={INK} backgroundColor={PAPER} wrap="truncate-end">
                {line + ' '.repeat(Math.max(0, bubble.width - cellWidth(line)))}
              </Text>
            ))}
          </Box>
        )}
        <Box position="absolute" top={scene.plate.row} left={2}>
          <Text color="#F4F1E6" backgroundColor={hex(scene.plate.color)} wrap="truncate-end">
            {scene.plate.label}
          </Text>
        </Box>
      </Box>
      {bubble === null ? <Text wrap="wrap">「{view.pet.text}」</Text> : null}
    </Box>
  )

  const isQuotaFolded = fit.isTight && view.quota.windows.length > 0 && view.quota.note === null
  const quota = (
    <Box flexDirection="column" gap={1}>
      {isQuotaFolded ? null : head('额度', view.quota.note === null ? null : <Text dimColor>{view.quota.note}</Text>)}
      {view.quota.windows.length === 0 ? (
        <Text dimColor>还没有额度读数。用订阅账号发一句话，我就看得到了。</Text>
      ) : (
        view.quota.windows.map(w => {
          const isOver = levelOf(w.pct, w.projected) === 'over'
          return (
            <Box flexDirection="column">
              {head(isQuotaFolded ? `${w.label}额度` : w.label, <Text dimColor>{w.reset}</Text>)}
              {raster(Raster, `meter-${w.label}`, meterCells(W, w.pct, w.projected === null ? null : Math.round(w.projected), view.scheme))}
              {w.sentence === null || (fit.isTerse && !isOver) ? null : isOver ? (
                <Text color="error">{w.sentence}</Text>
              ) : (
                <Text dimColor>{w.sentence}</Text>
              )}
            </Box>
          )
        })
      )}
    </Box>
  )

  const stats = view.stats
  const statsPart =
    stats === null ? (
      <Text dimColor>正在翻你的聊天记录，第一次要一两分钟。</Text>
    ) : (
      <Box flexDirection="column">
        {head(
          stats.heading,
          <Box flexDirection="row" gap={1} flexShrink={0}>
            <Button key="range-30" label="30 天" plain dimColor={stats.range !== '30'} onPress={() => view.on.range('30')} />
            <Button key="range-all" label="全部" plain dimColor={stats.range !== 'all'} onPress={() => view.on.range('all')} />
          </Box>,
        )}
        {tiles(el, stats.tiles, W, clay, fit.isFlatTiles)}
      </Box>
    )

  const trend = view.trend
  const trendFigures = trendStats(trend.map(d => d.tokens))
  const peak = `峰值 ${formatTokens(trendFigures.peak)}`
  const average = `7 日均线 ${formatTokens(trendFigures.average)}`
  const isTrendInHead = fit.isTight && cellWidth(`每日 token ${peak}  ${average}`) <= W
  const trendPart =
    trend.length < 2 ? null : (
      <Box flexDirection="column">
        {head(
          '每日 token',
          isTrendInHead ? (
            <Text wrap="truncate-end">
              <Text dimColor>{peak}</Text>
              <Text color={clay}>
                {'  '}
                {average}
              </Text>
            </Text>
          ) : null,
        )}
        {isTrendInHead ? null : (
          <Box flexDirection="row" justifyContent="space-between" width={W}>
            <Text dimColor wrap="truncate-end">
              {peak}
            </Text>
            <Text color={clay} wrap="truncate-end">
              {average}
            </Text>
          </Box>
        )}
        {raster(Raster, 'trend', trendCells(trend, W, view.scheme, fit.chartRows))}
      </Box>
    )

  const merges = view.merges
  const mergeInk = MERGE_INKS[view.scheme]
  const mergeToday = merges?.days.at(-1)
  const mergeSum = merges === null ? null : mergeTotals(merges.days)
  const mergePart =
    merges === null || mergeSum === null ? null : (
      <Box flexDirection="column">
        {head(
          '每日合并',
          <Text dimColor wrap="truncate-end">
            {merges.heading}
          </Text>,
        )}
        <Box flexDirection="row" justifyContent="space-between" width={W}>
          <Text wrap="truncate-end">
            <Text color={mergeInk.add}>■</Text>
            <Text dimColor> 新增 </Text>+{formatLines(mergeSum.additions)}
            <Text color={mergeInk.del}>{'  ■'}</Text>
            <Text dimColor> 删除 </Text>−{formatLines(mergeSum.deletions)}
            {W >= 46 ? <Text color={mergeInk.pr}>{'  ●'}</Text> : null}
            {W >= 46 ? <Text dimColor> PR</Text> : null}
          </Text>
          {W < 56 ? null : (
            <Text color={mergeInk.prText} wrap="truncate-end">
              {mergeToday === undefined || mergeToday.prs === 0 ? '今天还没合并' : `今天 ${mergeToday.prs} 个`}
            </Text>
          )}
        </Box>
        {raster(Raster, 'merges', mergeCells(merges.days, W, view.scheme, fit.chartRows))}
      </Box>
    )

  const { scale, weeks } = heatGrid(W)
  const legend = (swatches: JSX.Element[]) => (
    <Box flexDirection="row" justifyContent="flex-end" width={weeks * scale}>
      <Text wrap="truncate-end">
        <Text dimColor>少 </Text>
        {swatches}
        <Text dimColor> 多</Text>
      </Text>
    </Box>
  )
  const swatchesOf = (ramp: typeof CLAY) => heatColors(view.scheme, ramp).levels.map(color => <Text color={hex(color)}>■</Text>)
  const heatMaps = [
    view.usage === null ? null : { key: 'clay', title: 'Claude 使用', map: view.usage, ramp: CLAY },
    view.github === null ? null : { key: 'github', title: 'GitHub 贡献', map: view.github, ramp: GREEN },
  ].filter(heat => heat !== null)
  const isOneLegend = fit.isOneLegend && heatMaps.length === 2
  const heatParts = heatMaps.map((heat, i) => (
    <Box flexDirection="column">
      {head(
        heat.title,
        <Text dimColor wrap="truncate-end">
          {heat.map.heading}
        </Text>,
      )}
      {fit.isTerse && i > 0 ? null : (
        <Text dimColor wrap="truncate-end">
          {monthRow(view.today, weeks, scale)}
        </Text>
      )}
      {raster(Raster, heat.key, heatCells(heat.map.levelOn, view.today, W, view.scheme, heat.ramp))}
      {!isOneLegend ? legend(swatchesOf(heat.ramp)) : i === 0 ? null : legend(sharedSwatches(el, view.scheme))}
    </Box>
  ))

  return (
    <Box flexDirection="column" gap={1} width={W}>
      <Box flexDirection="column" gap={fit.isTight ? 0 : 1}>
        <Box flexDirection="row" justifyContent="space-between" gap={1} width={W}>
          <Text wrap="truncate-end">
            <Text color="success">● </Text>
            <Text bold>{view.title}</Text>
          </Text>
          <Text dimColor wrap="truncate-end">
            {view.repo}
          </Text>
        </Box>
        <Box flexDirection="column" gap={fit.hasButtonsGap ? 1 : 0}>
          {petPart}
          <Box flexDirection="row" gap={1}>
            <Button key="feed" label="喂水" onPress={view.on.feed} />
            <Button key="pat" label="摸摸" onPress={view.on.pat} />
            <Button key="sass" label="再嘴一句" onPress={view.on.sass} />
          </Box>
        </Box>
      </Box>
      {quota}
      {statsPart}
      {trendPart}
      {mergePart}
      {heatParts}
    </Box>
  )
}

/** One legend for both heatmaps: each cell shows a Claude level over the same GitHub level. */
function sharedSwatches(el: El, scheme: Scheme) {
  const { Text } = el
  const green = heatColors(scheme, GREEN).levels

  return heatColors(scheme, CLAY).levels.map((color, i) => (
    <Text color={hex(color)} backgroundColor={hex(green[i]!)}>
      ▀
    </Text>
  ))
}

/** Two framed tiles a row where they fit, else one line a tile; `isFlat` drops the frames. */
function tiles(el: El, t: TerminalTiles, W: number, clay: string, isFlat: boolean) {
  const { Box, Text } = el
  const isTwo = W >= TWO_TILES_MIN
  const columnGap = isFlat ? 3 : 1
  const tileWidth = isTwo ? Math.floor((W - columnGap) / 2) : W
  const inner = isTwo && !isFlat ? tileWidth - 4 : tileWidth
  const max = Math.max(1, ...t.bars)
  const hit = `${(t.cacheHitRate * 100).toFixed(1)}%`
  const tokens = formatTokens(t.tokens)
  const room = (value: string) => inner - cellWidth(value) - 1

  const barGap = room(tokens) >= t.bars.length * 2 + 1 ? ' ' : ''
  const barsWidth = t.bars.length + barGap.length * (t.bars.length - 1)
  const barsChart = (
    <Text>
      <Text dimColor>{t.bars.slice(0, -1).map(v => spark(v, max) + barGap).join('')}</Text>
      <Text color={clay}>{spark(t.bars.at(-1) ?? 0, max)}</Text>
    </Text>
  )
  const isWideWeek = room(`${t.streak} 天`) >= 13
  const weekChart = (
    <Text>
      {t.week.map((isOn, i) => (
        <Text color={isOn ? clay : 'subtle'}>{`${i === 0 || !isWideWeek ? '' : ' '}■`}</Text>
      ))}
    </Text>
  )
  const meterWidth = Math.min(12, room(hit))
  const lit = Math.round(meterWidth * Math.min(1, Math.max(0, t.cacheHitRate)))
  const hitChart = (
    <Text>
      <Text color={clay}>{'━'.repeat(lit)}</Text>
      <Text color="subtle">{'━'.repeat(meterWidth - lit)}</Text>
    </Text>
  )

  const tile = (key: string, label: string, value: string, suffix: string, chart: JSX.Element | null, chartWidth: number) => {
    const body = (
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Text wrap="truncate-end">
          <Text bold>{value}</Text>
          {suffix === '' ? null : <Text dimColor> {suffix}</Text>}
        </Text>
        {chart === null || room(suffix === '' ? value : `${value} ${suffix}`) < chartWidth ? null : chart}
      </Box>
    )
    if (!isTwo) {
      return (
        <Box key={key} flexDirection="row" justifyContent="space-between" gap={1} width={W}>
          <Text dimColor wrap="truncate-end">
            {label}
          </Text>
          <Text wrap="truncate-end">
            <Text bold>{value}</Text>
            {suffix === '' ? null : <Text dimColor> {suffix}</Text>}
          </Text>
        </Box>
      )
    }
    const labelText = (
      <Text dimColor wrap="truncate-end">
        {label}
      </Text>
    )
    if (isFlat) {
      return (
        <Box key={key} flexDirection="column" width={tileWidth}>
          {labelText}
          {body}
        </Box>
      )
    }
    return (
      <Box key={key} flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} width={tileWidth}>
        {labelText}
        {body}
      </Box>
    )
  }

  const tokenTile = tile('tile-tokens', t.tokensLabel, tokens, '', barsChart, barsWidth)
  const costTile = tile(
    'tile-cost',
    '按 API 价估算',
    t.costUsd,
    '',
    t.todayUsd === null ? null : <Text color={clay}>+{t.todayUsd}</Text>,
    t.todayUsd === null ? 0 : cellWidth(t.todayUsd) + 1,
  )
  const streakTile = tile('tile-streak', '连续使用', String(t.streak), '天', weekChart, isWideWeek ? 13 : 7)
  const hitTile = tile('tile-hit', '缓存命中', hit, '', meterWidth >= 4 ? hitChart : null, meterWidth)

  if (!isTwo) {
    return (
      <Box flexDirection="column">
        {tokenTile}
        {costTile}
        {streakTile}
        {hitTile}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={columnGap}>
        {tokenTile}
        {costTile}
      </Box>
      <Box flexDirection="row" gap={columnGap}>
        {streakTile}
        {hitTile}
      </Box>
    </Box>
  )
}
