import type { Level } from './levels'
import { levelInfo, levelLabel } from './levels'
import type { Mood } from './logic'
import { PIPS } from './logic'
import { esc, n, svgOpen, textWidth, uid } from './svg-kit'

export const SCENE_HEIGHT = 150
const GROUND_Y = 126
/** The mockup's pixel sizes times this fit the tallest level, 22 rows, between the ground and the top edge. */
const PX_SCALE = 0.92
const PET_CX = 56
const SEED_SINK = 6

export const BUBBLE_UNITS = 11
export const BUBBLE_ROWS = 3
const BUBBLE_FONT = 13
const BUBBLE_LINE = 19
const BUBBLE_WIDTH = (BUBBLE_UNITS + 1) * BUBBLE_FONT + 22
const BUBBLE_BOTTOM = 114
export const INK = '#3B2A1A'
export const PAPER = '#FFF8EC'

export const COLORS: Record<string, string> = {
  o: '#6B5A48',
  b: '#FFF4E6',
  d: '#EBD9C2',
  g: '#3F8F4A',
  G: '#8FD17A',
  E: '#2E2420',
  c: '#F7A8A8',
  m: '#2E2420',
  p: '#EC4899',
  P: '#F9A8D4',
  Y: '#FFE066',
  r: '#E53935',
  t: '#7A5230',
  y: '#D9A21B',
  L: '#FFE08A',
  h: '#FFF3B0',
  w: '#FFFFFF',
}

export const BODY = [
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbbbbbbbbbo..',
  '.obbbbbbbbbbbbo.',
  '.obbEEbbbbEEbbo.',
  'obbbEEbbbbEEbbbo',
  'obbcbbbmmbbbcbbo',
  'obbbbbbbbbbbbbbo',
  'obdbbbbbbbbbbdbo',
  '.oddbbbbbbbbddo.',
  '..oodddddddoo...',
  '....ooooooo.....',
]

/** Eye pixels per mood, as [x, y] in body rows; every other `E` cell is drawn as skin. */
export const EYES: Record<'squint' | 'shut' | 'smile', ReadonlyArray<[number, number]>> = {
  squint: [[4, 5], [5, 5], [10, 5], [11, 5]],
  shut: [[3, 4], [6, 4], [4, 5], [5, 5], [9, 4], [12, 4], [10, 5], [11, 5]],
  smile: [[4, 4], [5, 4], [3, 5], [6, 5], [10, 4], [11, 4], [9, 5], [12, 5]],
}

/** Sparkles of the gold level, clockwise from the top left, in sprite cells. */
export const SPARKLES: ReadonlyArray<[number, number]> = [
  [1.5, -0.6],
  [14.5, -0.6],
  [17, 5],
  [17.6, 12.5],
  [16.6, 19],
  [-0.6, 19],
  [-1.6, 12.5],
  [-1, 5],
]

export type SceneInput = {
  width: number
  mood: Mood
  action: 'feed' | 'pat' | null
  isConfetti: boolean
  level: number
  pips: number
  isDay: boolean
  rows: readonly string[]
  isPop: boolean
}

type Layout = {
  level: Level
  /** The size of one sprite cell in scene pixels. */
  s: number
  x0: number
  y0: number
  crownRows: number
  bodyTop: number
}

export function layoutOf(lv: number): Layout {
  const level = levelInfo(lv)
  const s = level.px * PX_SCALE
  const crownRows = level.crown.length
  const x0 = PET_CX - 8 * s
  const y0 = GROUND_Y - (crownRows + BODY.length - (level.isSeed ? SEED_SINK : 0)) * s

  return { level, s, x0, y0, crownRows, bodyTop: y0 + crownRows * s }
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function runs(rows: readonly string[], yOffset: number, pick: (ch: string, x: number, y: number) => string | null) {
  let out = ''
  rows.forEach((row, ry) => {
    const y = ry + yOffset
    let x = 0
    while (x < row.length) {
      const color = pick(row[x] ?? '.', x, y)
      if (color === null) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < row.length && pick(row[end] ?? '.', end, y) === color) end += 1
      out += `<rect x="${x}" y="${y}" width="${end - x + 0.02}" height="1.02" fill="${color}"/>`
      x = end
    }
  })

  return out
}

function birdSvg(id: string) {
  return `<g class="bird-${id}"><rect x="12" y="-1" width="2" height="2" fill="#60A5FA"/><rect x="14" y="-.4" width="1" height=".6" fill="#F59E0B"/><rect x="13" y="-.7" width=".5" height=".5" fill="#0B1020"/></g>`
}

function petalsSvg(id: string) {
  const random = rng(53)
  let out = ''
  for (let i = 0; i < 7; i++) {
    const x = (3 + random() * 9).toFixed(1)
    const y = (random() * 5).toFixed(1)
    const delay = (random() * 3).toFixed(2)
    const duration = (2.4 + random() * 1.6).toFixed(2)
    out += `<rect class="petal-${id}" style="animation-delay:${delay}s;animation-duration:${duration}s" x="${x}" y="${y}" width=".6" height=".6" fill="#F9A8D4"/>`
  }

  return out
}

function goldSvg(layout: Layout, id: string, isAsleep: boolean) {
  const rows = layout.crownRows + BODY.length
  const aura = `<defs><radialGradient id="aura-${id}"><stop offset="0" stop-color="#FFD866" stop-opacity=".85"/><stop offset="1" stop-color="#FFD866" stop-opacity="0"/></radialGradient></defs><ellipse class="aura-${id}" cx="8" cy="${rows / 2}" rx="11" ry="${rows / 2 + 2}" fill="url(#aura-${id})"/>`
  if (isAsleep) return aura
  const sparkles = SPARKLES.map(
    ([x, y], i) =>
      `<g class="spark-${id}" style="animation-delay:${(i * 0.3).toFixed(1)}s" fill="#FFE9A8"><rect x="${x - 0.3}" y="${y - 0.9}" width=".6" height="1.8"/><rect x="${x - 0.9}" y="${y - 0.3}" width="1.8" height=".6"/></g>`,
  ).join('')

  return aura + sparkles
}

/**
 * The color of one body pixel, `y` counted from the body's top row, in this mood. Open eyes (the happy mood)
 * come back null, so that the scene can draw them apart and blink them.
 */
export function bodyPixel(mood: Mood) {
  const eyeSet = mood === 'sleep' ? EYES.shut : mood === 'worry' ? EYES.squint : mood === 'party' ? EYES.smile : null
  const isEye = (x: number, y: number) => eyeSet?.some(([ex, ey]) => ex === x && ey === y) ?? false

  return (ch: string, x: number, y: number): string | null => {
    if (ch === '.') return null
    if (ch === 'E') return eyeSet === null ? null : isEye(x, y) ? COLORS.E! : COLORS.b!
    if (eyeSet !== null && ch === 'b' && isEye(x, y)) return COLORS.E!
    if (mood === 'sleep' && ch === 'm' && x === 8) return COLORS.b!

    return COLORS[ch] ?? null
  }
}

function petSvg(input: SceneInput, layout: Layout, id: string) {
  const { level, crownRows: C } = layout
  const crown = runs(level.crown, 0, ch => COLORS[ch] ?? null) + (level.hasBird === true ? birdSvg(id) : '')
  const pixel = bodyPixel(input.mood)
  const body = runs(BODY, C, (ch, x, y) => pixel(ch, x, y - C))
  const openEyes = input.mood === 'happy' ? runs(BODY, C, ch => (ch === 'E' ? COLORS.E! : null)) : ''

  let fx = level.hasPetals === true ? petalsSvg(id) : ''
  if (input.mood === 'worry') {
    fx += `<g class="sweat-${id}"><rect x="15" y="${C + 1}" width="1" height="1" fill="#7DD3FC"/><rect x="15" y="${C + 2}" width="1" height="1" fill="#38BDF8"/></g>`
  }
  if (input.action === 'feed') {
    const heart = (x: number, y: number, fill: string, delay: number) =>
      `<g class="heart-${id}" style="animation-delay:${delay}s"><rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/><rect x="${x + 2}" y="${y}" width="1" height="1" fill="${fill}"/><rect x="${x}" y="${y + 1}" width="3" height="1" fill="${fill}"/><rect x="${x + 1}" y="${y + 2}" width="1" height="1" fill="${fill}"/></g>`
    fx += heart(0, C - 1, '#F472B6', 0.35) + heart(13, C - 3, '#F9A8D4', 0.6)
    fx += [6, 9, 11]
      .map((x, i) => `<rect class="drop-${id}" style="animation-delay:${i * 0.12}s" x="${x}" y="-3" width="1" height="1" fill="#7DD3FC"/>`)
      .join('')
  }

  const bodyClass = input.action === 'pat' ? 'hop' : input.isConfetti ? 'party' : input.mood
  const back = level.isGold === true ? goldSvg(layout, id, input.mood === 'sleep') : ''
  const pet = `<g transform="translate(${n(layout.x0)},${n(layout.y0)}) scale(${layout.s.toFixed(3)})" shape-rendering="crispEdges">${back}<g class="${bodyClass}-${id}"><g class="sway-${id}${input.mood === 'worry' ? ` fast-${id}` : ''}">${crown}</g>${body}<g class="eyes-${id}">${openEyes}</g></g>${fx}</g>`

  return level.isSeed === true ? `<g clip-path="url(#soil-${id})">${pet}</g>` : pet
}

function bubbleSvg(input: SceneInput, layout: Layout, id: string) {
  const rows = input.rows
  if (rows.length === 0) return ''
  const w = BUBBLE_WIDTH
  const h = 16 + rows.length * BUBBLE_LINE
  const x = input.width - 12 - w
  const y = BUBBLE_BOTTOM - h
  const faceY = layout.bodyTop + 4.5 * layout.s
  const ty = Math.round(Math.max(y + 8, Math.min(y + h - 18, faceY - 6)))
  const r = (rx: number, ry: number, rw: number, rh: number, fill: string) =>
    `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}"/>`
  const frame =
    r(x + 4, y + 2, w - 8, h - 4, PAPER) +
    r(x + 2, y + 4, w - 4, h - 8, PAPER) +
    r(x + 4, y, w - 8, 2, INK) +
    r(x + 4, y + h - 2, w - 8, 2, INK) +
    r(x, y + 4, 2, h - 8, INK) +
    r(x + w - 2, y + 4, 2, h - 8, INK) +
    r(x + 2, y + 2, 2, 2, INK) +
    r(x + w - 4, y + 2, 2, 2, INK) +
    r(x + 2, y + h - 4, 2, 2, INK) +
    r(x + w - 4, y + h - 4, 2, 2, INK)
  const tail =
    r(x, ty + 2, 2, 4, PAPER) +
    r(x - 2, ty + 2, 2, 4, PAPER) +
    r(x - 4, ty + 4, 2, 2, PAPER) +
    r(x - 2, ty, 2, 2, INK) +
    r(x - 4, ty + 2, 2, 2, INK) +
    r(x - 6, ty + 4, 2, 2, INK) +
    r(x - 6, ty + 6, 6, 2, INK)
  const shadow = r(x + 4, y + h, w - 6, 2, 'rgba(0,0,0,0.28)') + r(x + w, y + 4, 2, h - 4, 'rgba(0,0,0,0.28)')
  const text = rows
    .map(
      (row, i) =>
        `<text x="${x + 12}" y="${y + 8 + BUBBLE_FONT + i * BUBBLE_LINE}" font-size="${BUBBLE_FONT}" fill="${INK}">${esc(row)}</text>`,
    )
    .join('')

  return `<g class="${input.isPop ? `pop-${id}` : ''}" style="transform-origin:${x}px ${ty + 4}px"><g shape-rendering="crispEdges">${shadow}${frame}${tail}</g>${text}</g>`
}

function levelSvg(input: SceneInput) {
  const label = esc(levelLabel(input.level))
  const size = 11
  const x = 10
  const lw = textWidth(label, size)
  const px = n(x + lw + 8)
  const end = px + PIPS * 11 - 3
  const pips = Array.from({ length: PIPS }, (_, i) => {
    const isOn = i < input.pips
    return `<rect x="${n(px + i * 11)}" y="138" width="8" height="4" fill="${isOn ? '#8FD17A' : 'rgba(255,255,255,0.22)'}"/>${isOn ? `<rect x="${n(px + i * 11)}" y="141" width="8" height="1" fill="#3F8F4A"/>` : ''}`
  }).join('')

  return `<g shape-rendering="crispEdges"><rect x="${x - 5}" y="131" width="${n(end - x + 11)}" height="16" fill="rgba(0,0,0,0.32)"/><rect x="${x - 3}" y="129" width="${n(end - x + 7)}" height="2" fill="rgba(0,0,0,0.32)"/><rect x="${x - 3}" y="147" width="${n(end - x + 7)}" height="2" fill="rgba(0,0,0,0.32)"/>${pips}</g><text x="${x + 1}" y="144" font-size="${size}" fill="rgba(0,0,0,0.6)">${label}</text><text x="${x}" y="143" font-size="${size}" fill="#F4F1E6">${label}</text>`
}

export type SkyPalette = { top: string; bottom: string; ground: string; tuft: string; light: string; cloud: string; glow: string }

export function skyPalette(isDay: boolean, isWorry: boolean): SkyPalette {
  if (isDay) {
    return isWorry
      ? { top: '#8E3B3B', bottom: '#E39A6B', ground: '#4A3A2A', tuft: '#6B4E36', light: '#FFB37A', cloud: '#F6C9B8', glow: '#FFF6C8' }
      : { top: '#5AAEE6', bottom: '#BFE4F7', ground: '#4E8B45', tuft: '#3D7336', light: '#FFE27A', cloud: '#FFFFFF', glow: '#FFF6C8' }
  }

  return isWorry
    ? { top: '#2A1220', bottom: '#4A1E2A', ground: '#3A1B22', tuft: '#6B2E3A', light: '#FFF1B8', cloud: '#FFFFFF', glow: '#FB7185' }
    : { top: '#0E1A33', bottom: '#24406A', ground: '#16301F', tuft: '#2F6B3F', light: '#FFF1B8', cloud: '#FFFFFF', glow: '#8FD17A' }
}

function skySvg(input: SceneInput, layout: Layout, id: string) {
  const W = input.width
  const isWorry = input.mood === 'worry'
  const { top, bottom, ground, tuft, light, cloud: cloudFill, glow } = skyPalette(input.isDay, isWorry)
  const random = rng(11)
  let s = ''
  if (input.isDay) {
    s += `<defs><linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><radialGradient id="glow-${id}"><stop offset="0" stop-color="${glow}" stop-opacity=".7"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`
    s += `<rect width="${W}" height="${SCENE_HEIGHT}" fill="url(#sky-${id})"/>`
    const sx = W - 42
    s += `<g shape-rendering="crispEdges" fill="${light}"><g class="sunray-${id}" style="transform-origin:${sx + 8}px 24px"><rect x="${sx + 7}" y="8" width="2" height="4"/><rect x="${sx + 7}" y="36" width="2" height="4"/><rect x="${sx - 8}" y="23" width="4" height="2"/><rect x="${sx + 20}" y="23" width="4" height="2"/><rect x="${sx - 4}" y="12" width="2" height="2"/><rect x="${sx + 18}" y="12" width="2" height="2"/><rect x="${sx - 4}" y="34" width="2" height="2"/><rect x="${sx + 18}" y="34" width="2" height="2"/></g><rect x="${sx}" y="16" width="16" height="16"/><rect x="${sx - 2}" y="18" width="20" height="12"/><rect x="${sx + 2}" y="14" width="12" height="20"/></g><rect x="${sx + 2}" y="18" width="4" height="4" fill="#FFF7D1" shape-rendering="crispEdges"/>`
    const cloud = (cx: number, cy: number, k: number, delay: number) =>
      `<g class="cloud-${id}" style="animation-delay:${delay}s" shape-rendering="crispEdges" fill="${cloudFill}" opacity=".92"><rect x="${cx}" y="${cy + 4 * k}" width="${22 * k}" height="${4 * k}"/><rect x="${cx + 4 * k}" y="${cy}" width="${8 * k}" height="${4 * k}"/><rect x="${cx + 10 * k}" y="${cy - 2 * k}" width="${6 * k}" height="${6 * k}"/></g>`
    s += cloud(Math.round(W * 0.36), 16, 1.5, 0) + cloud(Math.round(W * 0.62), 30, 1, 1.4)
    s += `<ellipse cx="${PET_CX}" cy="128" rx="${n(10 * layout.s)}" ry="16" fill="url(#glow-${id})"/>`
    s += `<rect y="${GROUND_Y}" width="${W}" height="${SCENE_HEIGHT - GROUND_Y}" fill="${ground}"/>`
    for (let x = 0; x < W; x += 9) {
      const hh = 2 + Math.round(random() * 3)
      s += `<rect x="${x}" y="${GROUND_Y - hh}" width="2" height="${hh}" fill="${tuft}"/>`
    }

    return s
  }

  s += `<defs><linearGradient id="sky-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><radialGradient id="glow-${id}"><stop offset="0" stop-color="${glow}" stop-opacity=".9"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs>`
  s += `<rect width="${W}" height="${SCENE_HEIGHT}" fill="url(#sky-${id})"/>`
  for (let i = 0; i < 24; i++) {
    const x = Math.round(random() * (W - 8))
    const y = Math.round(random() * 100)
    const delay = (random() * 3).toFixed(2)
    const z = random() < 0.3 ? 2 : 1
    s += `<rect class="star-${id}" x="${x}" y="${y}" width="${z}" height="${z}" fill="#FFF6D6" style="animation-delay:${delay}s"/>`
  }
  const mx = W - 40
  s += `<g shape-rendering="crispEdges" fill="${light}"><rect x="${mx + 2}" y="12" width="12" height="12"/><rect x="${mx}" y="14" width="2" height="8"/><rect x="${mx + 14}" y="14" width="2" height="8"/><rect x="${mx + 4}" y="10" width="8" height="2"/><rect x="${mx + 4}" y="24" width="8" height="2"/></g><rect x="${mx + 6}" y="12" width="10" height="10" fill="${top}" opacity=".9" shape-rendering="crispEdges"/>`
  s += `<ellipse class="glow-${id}" cx="${PET_CX}" cy="128" rx="${n(10 * layout.s)}" ry="18" fill="url(#glow-${id})"/>`
  s += `<rect y="${GROUND_Y}" width="${W}" height="${SCENE_HEIGHT - GROUND_Y}" fill="${ground}"/>`
  for (let x = 0; x < W; x += 9) {
    const hh = 2 + Math.round(random() * 3)
    s += `<rect x="${x}" y="${GROUND_Y - hh}" width="2" height="${hh}" fill="${tuft}"/>`
  }
  if (!isWorry) {
    for (let i = 0; i < 5; i++) {
      const x = Math.round(8 + random() * 140)
      const y = Math.round(44 + random() * 70)
      const delay = (random() * 4).toFixed(2)
      s += `<g class="fly-${id}" style="animation-delay:${delay}s"><rect class="blink-${id}" x="${x}" y="${y}" width="2" height="2" fill="#E9FF8A" style="animation-delay:${delay}s"/></g>`
    }
  }

  return s
}

function sleepSvg(layout: Layout, id: string) {
  const z = (x: number, y: number, k: number, delay: number) =>
    `<g class="z-${id}" style="animation-delay:${delay}s" fill="#E8F1FF" shape-rendering="crispEdges"><rect x="${x}" y="${y}" width="${5 * k}" height="${k}"/><rect x="${x + 3 * k}" y="${y + k}" width="${k}" height="${k}"/><rect x="${x + 2 * k}" y="${y + 2 * k}" width="${k}" height="${k}"/><rect x="${x + k}" y="${y + 3 * k}" width="${k}" height="${k}"/><rect x="${x}" y="${y + 4 * k}" width="${5 * k}" height="${k}"/></g>`

  const x = n(layout.x0 + 13 * layout.s + 1)
  const y = n(layout.bodyTop + 1.5 * layout.s - 10)

  return z(x, y, 2, 0) + z(x + 8, y - 22, 2, 1) + z(x + 12, y - 46, 3, 2)
}

function confettiSvg(id: string) {
  const random = rng(29)
  const colors = ['#F472B6', '#FCD34D', '#8FD17A', '#7DD3FC', '#FB923C']
  let s = ''
  for (let i = 0; i < 14; i++) {
    const x = Math.round(6 + random() * 150)
    const delay = (random() * 2.4).toFixed(2)
    s += `<rect class="confetti-${id}" style="animation-delay:${delay}s" x="${x}" y="-6" width="3" height="4" fill="${colors[i % colors.length]}"/>`
  }

  return s
}

function sceneCss(id: string) {
  return `<style>
@keyframes bob-${id}{0%,100%{transform:translateY(0)}50%{transform:translateY(-.6px)}}
@keyframes breathe-${id}{0%,100%{transform:translateY(0)}50%{transform:translateY(.4px)}}
@keyframes shake-${id}{0%,100%{transform:translateX(0)}25%{transform:translateX(-.5px)}75%{transform:translateX(.5px)}}
@keyframes hop-${id}{0%,100%{transform:translateY(0)}40%{transform:translateY(-3px)}}
@keyframes party-${id}{0%,30%,100%{transform:translateY(0)}10%,20%{transform:translateY(-3px)}15%{transform:translateY(-1px)}}
@keyframes blinkeye-${id}{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.15)}}
@keyframes sway-${id}{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes tw-${id}{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes fly-${id}{0%,100%{transform:translate(0,0)}25%{transform:translate(6px,-5px)}50%{transform:translate(-3px,-9px)}75%{transform:translate(-7px,-3px)}}
@keyframes glow-${id}{0%,100%{opacity:.35}50%{opacity:.7}}
@keyframes heart-${id}{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-6px);opacity:0}}
@keyframes drop-${id}{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(4px);opacity:0}}
@keyframes pop-${id}{0%{transform:scale(.9)}60%{transform:scale(1.04)}100%{transform:scale(1)}}
@keyframes z-${id}{0%{opacity:0;transform:translate(0,6px)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-8px)}}
@keyframes confetti-${id}{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(140px) rotate(200deg)}}
@keyframes cloud-${id}{0%,100%{transform:translateX(0)}50%{transform:translateX(8px)}}
@keyframes sun-${id}{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes birdhop-${id}{0%,70%,100%{transform:translateY(0)}80%{transform:translateY(-1px)}90%{transform:translateY(-.4px)}}
@keyframes petal-${id}{0%{transform:translate(0,0);opacity:0}10%{opacity:1}80%{opacity:.8}100%{transform:translate(-4px,14px);opacity:0}}
@keyframes aura-${id}{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes spark-${id}{0%,100%{opacity:0}12%,28%{opacity:1}40%{opacity:0}}
.happy-${id}{animation:bob-${id} 1.1s steps(2) infinite}
.sleep-${id}{animation:breathe-${id} 3s steps(3) infinite}
.worry-${id}{animation:shake-${id} .22s steps(2) infinite}
.hop-${id}{animation:hop-${id} .35s steps(3) 3}
.party-${id}{animation:party-${id} 1.6s steps(8) infinite}
.happy-${id} .eyes-${id}{animation:blinkeye-${id} 3.6s infinite;transform-box:fill-box;transform-origin:center}
.sway-${id}{animation:sway-${id} 2.6s steps(4) infinite;transform-box:fill-box;transform-origin:center bottom}
.fast-${id}{animation-duration:.5s}
.sleep-${id} .sway-${id}{animation-duration:6s}
.sweat-${id}{animation:tw-${id} .5s steps(2) infinite}
.star-${id}{animation:tw-${id} 2.4s steps(3) infinite}
.blink-${id}{animation:tw-${id} 1.6s infinite}
.fly-${id}{animation:fly-${id} 5s ease-in-out infinite}
.glow-${id}{animation:glow-${id} 2.8s ease-in-out infinite}
.heart-${id}{opacity:0;animation:heart-${id} 1.4s steps(5) forwards}
.drop-${id}{opacity:0;animation:drop-${id} .5s steps(4) forwards}
.pop-${id}{animation:pop-${id} .25s ease-out}
.z-${id}{opacity:0;animation:z-${id} 3s steps(6) infinite}
.confetti-${id}{animation:confetti-${id} 2.4s linear infinite}
.cloud-${id}{animation:cloud-${id} 9s steps(8) infinite}
.sunray-${id}{animation:sun-${id} 2.4s steps(2) infinite}
.bird-${id}{animation:birdhop-${id} 2.2s steps(1) infinite}
.petal-${id}{opacity:0;animation:petal-${id} 3s steps(10) infinite}
.aura-${id}{animation:aura-${id} 3s ease-in-out infinite}
.spark-${id}{opacity:0;animation:spark-${id} 2.4s steps(3) infinite}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.heart-${id},.drop-${id},.z-${id},.petal-${id}{opacity:0}.spark-${id}{opacity:1}}
</style>`
}

export function sceneSvg(input: SceneInput) {
  const id = uid('scene', JSON.stringify(input))
  const W = input.width
  const layout = layoutOf(input.level)

  return `${svgOpen(W, SCENE_HEIGHT)}${sceneCss(id)}<defs><clipPath id="clip-${id}"><rect width="${W}" height="${SCENE_HEIGHT}" rx="10"/></clipPath><clipPath id="soil-${id}"><rect width="${W}" height="${GROUND_Y}"/></clipPath></defs><g clip-path="url(#clip-${id})">${skySvg(input, layout, id)}${input.isConfetti ? confettiSvg(id) : ''}${petSvg(input, layout, id)}${input.mood === 'sleep' ? sleepSvg(layout, id) : ''}${levelSvg(input)}${bubbleSvg(input, layout, id)}</g></svg>`
}
