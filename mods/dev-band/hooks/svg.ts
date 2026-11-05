const FONT = '-apple-system, system-ui, sans-serif'
const SVG_OPEN = (width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`

const METER_WIDTH = 180
const METER_HEIGHT = 20
const METER_MIN_FILL = 12
const METER_FONT_SIZE = 11.5
const METER_TEXT_INSET = 12
const METER_TEXT_END = 170
const SHIMMER_WIDTH = 40

const LEVELS = {
  calm: { from: '#34D399', to: '#22D3EE', back: '#22D3EE', ink: '#06302a' },
  busy: { from: '#F59E0B', to: '#FCD34D', back: '#FCD34D', ink: '#3d2600' },
  full: { from: '#F43F5E', to: '#FB7185', back: '#FB7185', ink: '#4c0519' },
} as const

const GLYPH_EM: Record<string, number> = {
  ' ': 0.28,
  '%': 0.86,
  '.': 0.28,
  '/': 0.38,
  $: 0.62,
  '+': 0.62,
  '<': 0.62,
  k: 0.52,
  M: 0.86,
}

function level(percent: number) {
  if (percent > 85) return LEVELS.full
  if (percent >= 60) return LEVELS.busy

  return LEVELS.calm
}

function textWidth(text: string, size: number) {
  let em = 0
  for (const ch of text) em += GLYPH_EM[ch] ?? 0.62

  return em * size
}

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function uid(...parts: Array<string | number>) {
  let hash = 0
  for (const ch of parts.join('|')) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0

  return (hash >>> 0).toString(36)
}

function wavePath(edge: number) {
  return `M0 -20H${edge}q3 2.5 0 5${'t0 5'.repeat(11)}V40H0Z`
}

type Ink = 'light' | 'dark' | 'split'

function inkOver(fill: number, start: number, end: number): Ink {
  if (fill <= start - 2) return 'light'
  if (fill >= end + 2) return 'dark'

  return 'split'
}

export const meterSize = { width: METER_WIDTH, height: METER_HEIGHT }

export function meterSvg(percent: number, tokens: string | null) {
  const clamped = Math.min(100, Math.max(0, percent))
  const { from, to, back, ink } = level(clamped)
  const fill = Math.min(METER_WIDTH, Math.max(METER_MIN_FILL, Math.round((METER_WIDTH * clamped) / 100)))
  const id = uid('meter', fill, from, percent, tokens ?? '')
  const r = METER_HEIGHT / 2
  const label = `${Math.round(percent)}%`
  const labelWidth = textWidth(label, METER_FONT_SIZE)
  const isLabelInside = fill >= METER_TEXT_INSET + labelWidth + 5
  const labelX = isLabelInside ? METER_TEXT_INSET : fill + 6
  const tokensStart = tokens === null ? METER_TEXT_END : METER_TEXT_END - textWidth(tokens, METER_FONT_SIZE)

  const text = (body: string, inkKind: Ink, x: number, anchorEnd: boolean, weight: string, lightClass: string) => {
    const attrs = `x="${x}" y="14" font-family="${FONT}" font-size="${METER_FONT_SIZE}"${weight}${anchorEnd ? ' text-anchor="end"' : ''}`
    const dark = `<text ${attrs} fill="${ink}">${escapeXml(body)}</text>`
    const light = `<text ${attrs} class="${lightClass}">${escapeXml(body)}</text>`
    if (inkKind === 'dark') return dark
    if (inkKind === 'light') return light

    return `<g clip-path="url(#rest-${id})">${light}</g><g clip-path="url(#on-${id})">${dark}</g>`
  }

  return `${SVG_OPEN(METER_WIDTH, METER_HEIGHT)}
<style>
.track-${id}{fill:rgba(255,255,255,0.08)}
.ink-${id}{fill:rgba(255,255,255,0.55)}
.fg-${id}{fill:rgba(255,255,255,0.88)}
@media (prefers-color-scheme: light){.track-${id}{fill:rgba(0,0,0,0.08)}.ink-${id}{fill:rgba(0,0,0,0.55)}.fg-${id}{fill:rgba(0,0,0,0.78)}}
.wave-${id}{animation:wave-${id} 1.2s linear infinite}
.back-${id}{animation:wave-${id} 1.9s linear infinite reverse}
.shimmer-${id}{animation:shimmer-${id} 2.4s ease-in-out infinite}
@keyframes wave-${id}{to{transform:translateY(-10px)}}
@keyframes shimmer-${id}{0%{transform:translateX(0)}75%,100%{transform:translateX(${fill + SHIMMER_WIDTH}px)}}
@media (prefers-reduced-motion: reduce){.wave-${id},.back-${id}{animation:none}.shimmer-${id}{animation:none;opacity:0}}
text{font-variant-numeric:tabular-nums}
</style>
<defs>
<linearGradient id="grad-${id}" x1="0" x2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
<linearGradient id="sheen-${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="capsule-${id}"><rect width="${METER_WIDTH}" height="${METER_HEIGHT}" rx="${r}"/></clipPath>
<clipPath id="on-${id}"><rect width="${fill}" height="${METER_HEIGHT}"/></clipPath>
<clipPath id="rest-${id}"><rect x="${fill}" width="${METER_WIDTH - fill}" height="${METER_HEIGHT}"/></clipPath>
</defs>
<rect class="track-${id}" width="${METER_WIDTH}" height="${METER_HEIGHT}" rx="${r}"/>
<g clip-path="url(#capsule-${id})">
<path class="back-${id}" d="${wavePath(fill + 3)}" fill="${back}" opacity="0.45"/>
<path class="wave-${id}" d="${wavePath(fill - 1)}" fill="url(#grad-${id})"/>
<g clip-path="url(#on-${id})"><rect class="shimmer-${id}" x="${-SHIMMER_WIDTH}" width="${SHIMMER_WIDTH}" height="${METER_HEIGHT}" fill="url(#sheen-${id})" opacity="0.7"/></g>
</g>
${text(label, isLabelInside ? 'dark' : 'light', labelX, false, ' font-weight="500"', `fg-${id}`)}
${tokens === null ? '' : text(tokens, inkOver(fill, tokensStart, METER_TEXT_END), METER_TEXT_END, true, '', `ink-${id}`)}
</svg>`
}

const COMETS = [
  { seconds: 2.6, phase: 0 },
  { seconds: 3.2, phase: 200 },
  { seconds: 3.8, phase: 110 },
  { seconds: 2.9, phase: 290 },
  { seconds: 4.4, phase: 45 },
]
const COMET_DOTS = [
  { cx: 21, cy: 12, r: 1.9, opacity: 1 },
  { cx: 20.73, cy: 9.82, r: 1.55, opacity: 0.75 },
  { cx: 19.93, cy: 7.77, r: 1.2, opacity: 0.5 },
  { cx: 18.67, cy: 5.98, r: 0.85, opacity: 0.25 },
]

export const orbitSize = { width: 24, height: 24 }

export function orbitSvg(count: number) {
  const shown = COMETS.slice(0, Math.max(0, Math.min(COMETS.length, count)))
  const id = uid('orbit', shown.length)
  const dots = COMET_DOTS.map(
    dot => `<circle class="comet-${id}" cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" opacity="${dot.opacity}"/>`,
  ).join('')
  const comets = shown
    .map(
      comet =>
        `<g transform="rotate(${comet.phase} 12 12)"><g class="spin-${id}" style="animation-duration:${comet.seconds}s">${dots}</g></g>`,
    )
    .join('\n')

  return `${SVG_OPEN(24, 24)}
<style>
.ring-${id}{fill:none;stroke:rgba(217,119,87,0.18)}
.comet-${id}{fill:#F5B48F}
@media (prefers-color-scheme: light){.ring-${id}{stroke:rgba(217,119,87,0.3)}.comet-${id}{fill:#D97757}}
.spin-${id}{transform-origin:12px 12px;animation:spin-${id} linear infinite}
@keyframes spin-${id}{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.spin-${id}{animation:none}}
</style>
<defs><radialGradient id="core-${id}"><stop offset="0" stop-color="#F5B48F"/><stop offset="1" stop-color="#D97757"/></radialGradient></defs>
<circle class="ring-${id}" cx="12" cy="12" r="9"/>
<circle cx="12" cy="12" r="3.2" fill="url(#core-${id})"/>
${comets}
</svg>`
}

const SPARK_HEIGHT = 16
const SPARK_MAX_BAR = 14
const SPARK_BAR = 3
const SPARK_STEP = 4.6

export function sparkSize(count: number) {
  return { width: Math.ceil(count * SPARK_STEP - (SPARK_STEP - SPARK_BAR)), height: SPARK_HEIGHT }
}

export function sparkSvg(deltas: number[], freshAt: number | null) {
  const { width, height } = sparkSize(deltas.length)
  const max = Math.max(...deltas, 0)
  const id = uid('spark', deltas.join(','), freshAt ?? 'still')
  const bars = deltas
    .map((delta, i) => {
      const h = Math.max(2, max > 0 ? Math.round((delta / max) * SPARK_MAX_BAR) : 2)
      const isNewest = i === deltas.length - 1
      const kind = isNewest ? `newest-${id}${freshAt === null ? '' : ` grow-${id}`}` : `bar-${id}`
      const x = Number((i * SPARK_STEP).toFixed(2))

      return `<rect class="${kind}" x="${x}" y="${SPARK_HEIGHT - h}" width="${SPARK_BAR}" height="${h}" rx="1"/>`
    })
    .join('')

  return `${SVG_OPEN(width, height)}
<style>
.bar-${id}{fill:rgba(255,255,255,0.22)}
@media (prefers-color-scheme: light){.bar-${id}{fill:rgba(0,0,0,0.18)}}
.newest-${id}{fill:#D97757}
.grow-${id}{transform-box:fill-box;transform-origin:center bottom;animation:grow-${id} 0.6s cubic-bezier(.3,1.3,.5,1) 0.3s 1 both}
@keyframes grow-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@media (prefers-reduced-motion: reduce){.grow-${id}{animation:none}}
</style>
${bars}
</svg>`
}

const ODO_FONT_SIZE = 15
const ODO_HEIGHT = 20
const ODO_BASELINE = 15

export function odometerSize(labels: string[]) {
  const widest = Math.max(...labels.map(label => textWidth(label, ODO_FONT_SIZE)))

  return { width: Math.ceil(widest + 1), height: ODO_HEIGHT }
}

export function odometerSvg(total: string, rolling: { from: string; at: number } | null) {
  const { width, height } = odometerSize(rolling === null ? [total] : [rolling.from, total])
  const id = rolling === null ? uid('odo', total) : uid('odo', rolling.from, total, rolling.at)
  const body =
    rolling === null
      ? `<text class="num-${id}" font-family="${FONT}" x="0" y="${ODO_BASELINE}">${escapeXml(total)}</text>`
      : `<g class="roll-${id}"><text class="num-${id}" font-family="${FONT}" x="0" y="${ODO_BASELINE}">${escapeXml(rolling.from)}</text><text class="num-${id}" font-family="${FONT}" x="0" y="${ODO_BASELINE + ODO_HEIGHT}">${escapeXml(total)}</text></g>`

  return `${SVG_OPEN(width, height)}
<style>
.num-${id}{fill:#ececec;font-size:${ODO_FONT_SIZE}px;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme: light){.num-${id}{fill:#1f1f1f}}
.roll-${id}{animation:roll-${id} 0.6s cubic-bezier(.3,1.3,.5,1) 0.3s 1 both}
@keyframes roll-${id}{from{transform:translateY(0)}to{transform:translateY(-${ODO_HEIGHT}px)}}
@media (prefers-reduced-motion: reduce){.roll-${id}{animation:none;transform:translateY(-${ODO_HEIGHT}px)}}
</style>
${body}
</svg>`
}

const PILL_FONT_SIZE = 12
const PILL_HEIGHT = 18
const PILL_PAD = 7

export function pillSize(label: string) {
  return { width: Math.ceil(textWidth(label, PILL_FONT_SIZE) + PILL_PAD * 2), height: PILL_HEIGHT + 2 }
}

export function pillSvg(label: string, at: number) {
  const { width, height } = pillSize(label)
  const id = uid('pill', label, at)

  return `${SVG_OPEN(width, height)}
<style>
.pill-${id}{animation:pill-${id} 5.4s ease-out 1 forwards}
@keyframes pill-${id}{0%{opacity:0;transform:translateY(5px)}9%{opacity:1;transform:none}85%{opacity:1;transform:none}100%{opacity:0;transform:none}}
@media (prefers-reduced-motion: reduce){.pill-${id}{animation:none}}
.label-${id}{fill:#F5B48F;font-size:${PILL_FONT_SIZE}px;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme: light){.label-${id}{fill:#B4532F}}
</style>
<g class="pill-${id}">
<rect x="0" y="1" width="${width}" height="${PILL_HEIGHT}" rx="${PILL_HEIGHT / 2}" fill="rgba(217,119,87,0.16)"/>
<text class="label-${id}" font-family="${FONT}" x="${width / 2}" y="14" text-anchor="middle">${escapeXml(label)}</text>
</g>
</svg>`
}

export const dividerSize = { width: 9, height: 14 }

export const DIVIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="14" viewBox="0 0 9 14">
<style>
rect{fill:rgba(255,255,255,0.14)}
@media (prefers-color-scheme: light){rect{fill:rgba(0,0,0,0.14)}}
</style>
<rect x="4" y="0" width="1" height="14"/>
</svg>`
