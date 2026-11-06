import type { SproutDay } from '../types'
import { addDays, dayFromNumber, dayNumber, formatTokens, weekdayOf, withCommas } from './logic'
import { esc, n, paletteCss, svgOpen, textWidth, uid } from './svg-kit'

const LEVELS = {
  ok: { from: '#34D399', to: '#22D3EE', ink: '#06302A' },
  warn: { from: '#FBBF24', to: '#F97316', ink: '#3A1D02' },
  over: { from: '#FB7185', to: '#E11D48', ink: '#FFF1F2' },
} as const

export type Level = keyof typeof LEVELS

export function levelOf(pct: number, projected: number | null): Level {
  const worst = Math.max(pct, projected ?? 0)
  if (worst > 100) return 'over'
  if (worst >= 85) return 'warn'

  return 'ok'
}

const CAPSULE_HEIGHT = 22

export const capsuleHeight = CAPSULE_HEIGHT

export function capsuleSvg(width: number, pct: number, projected: number | null) {
  const W = width
  const H = CAPSULE_HEIGHT
  const level = levelOf(pct, projected)
  const { from, to, ink } = LEVELS[level]
  const fill = Math.max(10, Math.min(W, (W * Math.min(100, pct)) / 100))
  const fc = projected === null ? null : Math.max(pct, projected)
  const fcX = fc === null ? fill : Math.min(W, (W * Math.min(100, fc)) / 100)
  const isOver = fc !== null && fc > 100
  const fcColor = isOver ? '#FB7185' : from
  const id = uid('cap', W, pct, Math.round(fc ?? -1), level)
  const label = `${Math.round(pct)}%`
  const isOut = pct >= 100
  const end = isOut ? '用完了' : fc === null ? '' : isOver ? `超 ${Math.round(fc - 100)}%` : `→ ${Math.round(fc)}%`
  const endWidth = textWidth(end, 12)
  const hasPill = end !== '' && (isOut || isOver || fcX > W - endWidth - 18)
  const isLabelInside = fill >= textWidth(label, 12) + 16
  const wave = (edge: number) => `M0 -20H${n(edge)}q3 2.5 0 5${'t0 5'.repeat(11)}V44H0Z`

  return `${svgOpen(W, H)}<style>${paletteCss(id)}
.wv-${id}{animation:wv-${id} 1.2s linear infinite}.wb-${id}{animation:wv-${id} 1.9s linear infinite reverse}
.sh-${id}{animation:sh-${id} 2.6s ease-in-out infinite}.ov-${id}{animation:ov-${id} 1s ease-in-out infinite}
.end-${id}{fill:#a6a39b}@media (prefers-color-scheme: light){.end-${id}{fill:#5e5d59}}
.endo-${id}{fill:#FDA4AF;animation:ov-${id} 1s ease-in-out infinite}.pill-${id}{fill:#262624;opacity:.88}
@media (prefers-color-scheme: light){.endo-${id}{fill:#BE123C}.pill-${id}{fill:#ffffff}}
@keyframes wv-${id}{to{transform:translateY(-10px)}}
@keyframes sh-${id}{0%{transform:translateX(0)}70%,100%{transform:translateX(${n(fill + 36)}px)}}
@keyframes ov-${id}{0%,100%{opacity:.35}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.wv-${id},.wb-${id},.ov-${id},.endo-${id}{animation:none}.sh-${id}{animation:none;opacity:0}.st-${id}{display:none}}
</style><defs><clipPath id="c-${id}"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath><linearGradient id="g-${id}" x1="0" x2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><linearGradient id="s-${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><pattern id="p-${id}" width="8" height="${H}" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)"><rect width="3.5" height="${H}" fill="${fcColor}" opacity=".55"/><animateTransform class="st-${id}" attributeName="patternTransform" type="translate" from="0 0" to="8 0" dur=".9s" repeatCount="indefinite" additive="sum"/></pattern></defs>
<rect class="tr-${id}" width="${W}" height="${H}" rx="${H / 2}"/>
<g clip-path="url(#c-${id})">${fcX > fill ? `<rect x="${n(fill)}" width="${n(fcX - fill)}" height="${H}" fill="url(#p-${id})"/>` : ''}${isOver ? `<rect class="ov-${id}" x="${W - 18}" width="18" height="${H}" fill="#FB7185"/>` : ''}<path class="wb-${id}" d="${wave(fill + 3)}" fill="${to}" opacity=".45"/><path class="wv-${id}" d="${wave(fill - 1)}" fill="url(#g-${id})"/><rect class="sh-${id}" x="-36" width="36" height="${H}" fill="url(#s-${id})"/></g>
<text x="${isLabelInside ? 10 : n(fill + 6)}" y="15.5" font-size="12" font-weight="500" ${isLabelInside ? `fill="${ink}"` : `class="t1-${id}"`}>${label}</text>
${fc === null || fcX <= fill + 1 ? '' : `<line x1="${n(fcX - 0.75)}" x2="${n(fcX - 0.75)}" y1="3" y2="${H - 3}" stroke="${fcColor}" stroke-width="1.5" stroke-dasharray="2 2"/>`}
${hasPill ? `<rect class="pill-${id}" x="${n(W - endWidth - 17)}" y="3" width="${n(endWidth + 14)}" height="${H - 6}" rx="${(H - 6) / 2}"/>` : ''}
${end === '' ? '' : `<text x="${W - 10}" y="15.5" text-anchor="end" font-size="12" font-weight="500" class="${isOver || isOut ? `endo-${id}` : `end-${id}`}">${esc(end)}</text>`}
</svg>`
}

type RollFrom = string | null

function rollText(id: string, x: number, y: number, size: number, text: string, from: RollFrom, cls: string, delay: number) {
  const lh = Math.round(size * 1.25)
  const fromChars = from !== null && from.length === text.length ? [...from] : null
  let cx = x
  let out = ''
  let digitIndex = 0
  for (const [i, ch] of [...text].entries()) {
    const w = textWidth(ch, size)
    if (/\d/.test(ch)) {
      const to = Number(ch)
      const start = fromChars !== null && /\d/.test(fromChars[i] ?? '') ? Number(fromChars[i]) : 0
      const column = Array.from({ length: 10 }, (_, d) => `<text x="${n(cx)}" y="${y + d * lh}" class="${cls}">${d}</text>`).join('')
      const d = (delay + digitIndex * 0.06).toFixed(2)
      out += `<g clip-path="url(#line-${id}-${Math.round(y)})"><g class="roll-${id}" style="--f:${-start * lh}px;--t:${-to * lh}px;transform:translateY(${-to * lh}px);animation-delay:${d}s">${column}</g></g>`
      digitIndex += 1
    } else {
      out += `<text x="${n(cx)}" y="${y}" class="${cls}">${esc(ch)}</text>`
    }
    cx += w
  }

  return { svg: out, width: cx - x, clip: `<clipPath id="line-${id}-${Math.round(y)}"><rect x="0" y="${n(y - size)}" width="10000" height="${n(size * 1.3)}"/></clipPath>` }
}

export type TilesInput = {
  width: number
  tokens: number
  costUsd: number
  todayUsd: number
  streak: number
  week: boolean[]
  cacheHitRate: number
  bars: number[]
  previous: { tokens: number; costUsd: number; cacheHitRate: number } | null
}

export const TILE_HEIGHT = 54

export function tilesHeight() {
  return TILE_HEIGHT * 2 + 8
}

export function tilesSvg(input: TilesInput) {
  const W = input.width
  const H = tilesHeight()
  const id = uid('tiles', JSON.stringify(input))
  const tw = (W - 8) / 2
  const th = TILE_HEIGHT
  const tokens = formatTokens(input.tokens)
  const cost = `$${withCommas(input.costUsd)}`
  const hit = `${(input.cacheHitRate * 100).toFixed(1)}%`
  const prev = input.previous
  const clips: string[] = []
  const tile = (col: number, row: number, label: string, value: string, from: RollFrom, suffix: string, extra: (x: number, y: number) => string, delay: number) => {
    const x = col * (tw + 8)
    const y = row * (th + 8)
    const rolled = rollText(id, x + 10, y + th - 12, 20, value, from, `num-${id}`, delay)
    clips.push(rolled.clip)
    const tail = suffix === '' ? '' : `<text x="${n(x + 10 + rolled.width + 3)}" y="${y + th - 12}" font-size="12" class="t3-${id}">${suffix}</text>`

    return `<rect class="bg-${id}" x="${n(x)}" y="${y}" width="${n(tw)}" height="${th}" rx="8"/><text x="${n(x + 10)}" y="${y + 19}" font-size="12" class="t2-${id}">${label}</text>${rolled.svg}${tail}${extra(x + tw - 10, y + th - 10)}`
  }

  const bars = (right: number, bottom: number) => {
    const max = Math.max(1, ...input.bars)
    return input.bars
      .map((v, i) => {
        const h = Math.max(1.5, (v / max) * 22)
        const x = right - (input.bars.length - i) * 4 + 1
        const isToday = i === input.bars.length - 1
        return `<rect class="${isToday ? `today-${id}` : `bar-${id}`} grow-${id}" style="animation-delay:${(0.3 + i * 0.04).toFixed(2)}s" x="${x}" y="${n(bottom - h)}" width="3" height="${n(h)}" rx="1"/>`
      })
      .join('')
  }
  const pill = (right: number, bottom: number) => {
    if (input.todayUsd <= 0) return ''
    const label = `+$${input.todayUsd < 10 ? input.todayUsd.toFixed(2) : withCommas(input.todayUsd)}`
    const w = textWidth(label, 12) + 14
    return `<g class="fade-${id}"><rect x="${n(right - w)}" y="${bottom - 18}" width="${n(w)}" height="18" rx="9" fill="rgba(217,119,87,0.16)"/><text x="${n(right - w / 2)}" y="${bottom - 5}" text-anchor="middle" font-size="12" class="clay-${id}">${esc(label)}</text></g>`
  }
  const week = (right: number, bottom: number) =>
    input.week
      .map((isOn, i) => {
        const x = right - (input.week.length - i) * 8 + 2
        const isToday = i === input.week.length - 1
        return `<rect x="${x}" y="${bottom - 7}" width="6" height="6" rx="1.5" class="${isOn ? `on-${id}` : `tr-${id}`}${isToday ? ` pulse-${id}` : ''}"/>`
      })
      .join('')
  const ring = (right: number, bottom: number) => {
    const cx = right - 15
    const cy = bottom - 15
    const c = 2 * Math.PI * 12
    const off = c * (1 - Math.max(0, Math.min(1, input.cacheHitRate)))
    return `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke-width="4" class="str-${id}"/><circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="url(#rg-${id})" stroke-width="4" stroke-linecap="round" stroke-dasharray="${n(c)}" stroke-dashoffset="${n(off)}" transform="rotate(-90 ${cx} ${cy})" class="ring-${id}"/>`
  }

  const body =
    tile(0, 0, '累计 token', tokens, prev === null ? null : formatTokens(prev.tokens), '', bars, 0) +
    tile(1, 0, '估算费用', cost, prev === null ? null : `$${withCommas(prev.costUsd)}`, '', pill, 0.1) +
    tile(0, 1, '连续使用', String(input.streak), null, '天', week, 0.2) +
    tile(1, 1, '缓存命中', hit, prev === null ? null : `${(prev.cacheHitRate * 100).toFixed(1)}%`, '', ring, 0.3)
  const c = 2 * Math.PI * 12

  return `${svgOpen(W, H)}<style>${paletteCss(id)}
.num-${id}{fill:#ececec;font-size:20px;font-weight:500}@media (prefers-color-scheme: light){.num-${id}{fill:#1f1e1d}}
.today-${id}{fill:#D97757}.on-${id}{fill:#3F8F4A}.clay-${id}{fill:#E8906F}@media (prefers-color-scheme: light){.clay-${id}{fill:#B4532F}}
.roll-${id}{animation:roll-${id} 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes roll-${id}{from{transform:translateY(var(--f))}to{transform:translateY(var(--t))}}
.grow-${id}{transform-box:fill-box;transform-origin:center bottom;animation:grow-${id} .5s cubic-bezier(.3,1.3,.5,1) both}
@keyframes grow-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.fade-${id}{animation:fade-${id} .5s ease-out .6s both}@keyframes fade-${id}{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.pulse-${id}{animation:pulse-${id} 1.2s infinite}@keyframes pulse-${id}{0%,100%{opacity:1}50%{opacity:.25}}
.ring-${id}{animation:ring-${id} 1.4s cubic-bezier(.2,.8,.2,1)}@keyframes ring-${id}{from{stroke-dashoffset:${n(c)}}}
@media (prefers-reduced-motion: reduce){.roll-${id},.grow-${id},.fade-${id},.pulse-${id},.ring-${id}{animation:none}}
</style><defs><linearGradient id="rg-${id}" x1="0" x2="1"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>${clips.join('')}</defs>${body}</svg>`
}

export const TREND_HEIGHT = 84

export function trendSvg(width: number, days: readonly SproutDay[]) {
  const W = width
  const H = TREND_HEIGHT
  const T = 18
  const values = days.map(d => d.tokens)
  const id = uid('trend', W, values.join(','))
  if (values.length === 0) return null
  const max = Math.max(1, ...values)
  const bw = W / values.length
  const Y = (v: number) => H - (v / max) * (H - T)
  const avg = values.map((_, i) => {
    const win = values.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((a, b) => a + b, 0) / win.length
  })
  const pts = avg.map((v, i) => [i * bw + bw / 2, Y(v)] as const)
  const line = pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')
  const last = pts.at(-1) ?? [W, H]
  const step = values.length > 60 ? 0 : 12
  const bars = values
    .map((v, i) => {
      const h = H - Y(v)
      if (h <= 0) return ''
      return `<rect class="bar-${id} pop-${id}" style="animation-delay:${i * step}ms" x="${n(i * bw + bw * 0.2)}" y="${n(Y(v))}" width="${n(Math.max(0.6, bw * 0.6))}" height="${n(h)}" rx="${bw > 4 ? 1 : 0}"/>`
    })
    .join('')
  const peak = `峰值 ${formatTokens(max)}`
  const now = `7 日均线 ${formatTokens(avg.at(-1) ?? 0)}`

  return `${svgOpen(W, H)}<style>${paletteCss(id)}
.pop-${id}{transform-box:fill-box;transform-origin:center bottom;animation:pop-${id} .35s cubic-bezier(.3,1.6,.5,1) backwards}
@keyframes pop-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.draw-${id}{stroke-dasharray:1;animation:draw-${id} 1.3s ease-out backwards}@keyframes draw-${id}{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.pulse-${id}{animation:pulse-${id} 1.6s ease-out infinite}@keyframes pulse-${id}{0%{r:3;opacity:1}100%{r:10;opacity:0}}
.clay-${id}{fill:#E8906F}@media (prefers-color-scheme: light){.clay-${id}{fill:#B4532F}}
@media (prefers-reduced-motion: reduce){.pop-${id},.draw-${id},.pulse-${id}{animation:none}.pulse-${id}{opacity:0}}
</style><defs><linearGradient id="ar-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D97757" stop-opacity=".45"/><stop offset="1" stop-color="#D97757" stop-opacity="0"/></linearGradient></defs>
${bars}
<path d="M${n(pts[0]?.[0] ?? 0)},${H} L${line} L${n(last[0])},${H}Z" fill="url(#ar-${id})"/>
<path class="draw-${id}" d="M${line}" fill="none" stroke="#F0997B" stroke-width="5" stroke-opacity=".25" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>
<path class="draw-${id}" d="M${line}" fill="none" stroke="#D97757" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>
<circle class="pulse-${id}" cx="${n(Math.min(W - 4, last[0]))}" cy="${n(last[1])}" r="3" fill="none" stroke="#D97757"/><circle cx="${n(Math.min(W - 4, last[0]))}" cy="${n(last[1])}" r="3" fill="#D97757"/>
<text x="0" y="11" font-size="11" class="t3-${id}">${peak}</text><text x="${W}" y="11" text-anchor="end" font-size="11" class="clay-${id}">${now}</text>
</svg>`
}

const CLAY = ['', '#F5C4B3', '#F0997B', '#D97757', '#993C1D']

export function usageHeatmapSvg(width: number, days: readonly SproutDay[], firstDay: string, today: string) {
  const W = width
  const firstMonday = addDays(firstDay, -weekdayOf(firstDay))
  const totalWeeks = Math.floor((dayNumber(today) - dayNumber(firstMonday)) / 7) + 1
  const legendW = 92
  let pitch = Math.min(17, W / totalWeeks)
  let weeks = totalWeeks
  if (pitch < 7) {
    pitch = 7
    weeks = Math.floor(W / pitch)
  }
  const cell = pitch * (14 / 17)
  const radius = n(cell * 0.25)
  const startMonday = addDays(firstMonday, (totalWeeks - weeks) * 7)
  const top = 16
  const gridH = 7 * pitch
  const H = Math.ceil(top + gridH + 18)
  const map = new Map(days.map(d => [d.day, d.tokens]))
  const max = Math.max(1, ...days.map(d => d.tokens))
  const id = uid('clay', W, firstDay, today, days.map(d => `${d.day}:${d.tokens}`).join(','))
  let cells = ''
  let months = ''
  let lastLabelX = -100
  const todayN = dayNumber(today)
  const firstN = dayNumber(firstDay)
  for (let c = 0; c < weeks; c++) {
    const colStart = dayNumber(startMonday) + c * 7
    for (let r = 0; r < 7; r++) {
      const dn = colStart + r
      if (dn > todayN) continue
      const day = dayFromNumber(dn)
      const v = map.get(day) ?? 0
      const k = dn < firstN || v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.99))
      const x = n(c * pitch)
      const y = n(top + r * pitch)
      const delay = Math.round(c * (weeks > 26 ? 12 : 40) + r * 8)
      cells += `<rect class="k${k}-${id} pop-${id}" style="animation-delay:${delay}ms" x="${x}" y="${y}" width="${n(cell)}" height="${n(cell)}" rx="${radius}"/>`
      if (dn === todayN) {
        cells += `<rect class="ring-${id}" x="${n(c * pitch - 2)}" y="${n(top + r * pitch - 2)}" width="${n(cell + 4)}" height="${n(cell + 4)}" rx="${n(cell * 0.3 + 1.5)}" fill="none" stroke="#D97757" stroke-width="1.5"/>`
      }
    }
    for (let r = 0; r < 7; r++) {
      const day = dayFromNumber(colStart + r)
      if (day.endsWith('-01') || (c === 0 && r === 0)) {
        const x = c * pitch
        const label = `${Number(day.slice(5, 7))}月`
        if (x - lastLabelX >= textWidth(label, 11) + 6 && x + textWidth(label, 11) <= W) {
          months += `<text x="${n(x)}" y="10" font-size="11" class="t3-${id}">${label}</text>`
          lastLabelX = x
        }
        break
      }
    }
  }
  const lx = W - legendW
  const ly = H - 12
  const legend = `<text x="${lx}" y="${ly + 9}" font-size="11" class="t3-${id}">少</text>${[0, 1, 2, 3, 4]
    .map(k => `<rect class="k${k}-${id}" x="${lx + 14 + k * 12}" y="${ly}" width="10" height="10" rx="2.5"/>`)
    .join('')}<text x="${lx + 14 + 5 * 12 + 2}" y="${ly + 9}" font-size="11" class="t3-${id}">多</text>`
  const kinds = CLAY.map((color, k) => (k === 0 ? '' : `.k${k}-${id}{fill:${color}}`)).join('')

  return {
    height: H,
    svg: `${svgOpen(W, H)}<style>${paletteCss(id)}
.k0-${id}{fill:rgba(255,255,255,0.08)}${kinds}
@media (prefers-color-scheme: light){.k0-${id}{fill:rgba(0,0,0,0.07)}}
.pop-${id}{transform-box:fill-box;transform-origin:center;animation:pop-${id} .35s cubic-bezier(.3,1.6,.5,1) backwards}
@keyframes pop-${id}{from{transform:scale(0)}to{transform:scale(1)}}
.ring-${id}{animation:tw-${id} 1.4s infinite}@keyframes tw-${id}{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.pop-${id},.ring-${id}{animation:none}}
</style>${months}${cells}${legend}</svg>`,
  }
}

const GREEN = ['', '#9BE9A8', '#40C463', '#30A14E', '#216E39']

export function githubHeatmapSvg(width: number, levels: string) {
  const W = width
  const columns = Math.ceil(levels.length / 7)
  const pitch = W / Math.max(1, columns)
  const cell = n(pitch * 0.78)
  const H = Math.ceil(7 * pitch)
  const id = uid('gh', W, levels)
  let cells = ''
  for (let i = 0; i < levels.length; i++) {
    const k = Number(levels[i] ?? '0')
    const c = Math.floor(i / 7)
    const r = i % 7
    cells += `<rect class="k${k}-${id} gl-${id}" style="animation-delay:${(c * 0.035).toFixed(2)}s" x="${n(c * pitch)}" y="${n(r * pitch)}" width="${cell}" height="${cell}" rx="1"/>`
  }
  const kinds = GREEN.map((color, k) => (k === 0 ? '' : `.k${k}-${id}{fill:${color}}`)).join('')

  return {
    height: H,
    svg: `${svgOpen(W, H)}<style>
.k0-${id}{fill:rgba(255,255,255,0.08)}${kinds}
@media (prefers-color-scheme: light){.k0-${id}{fill:rgba(0,0,0,0.07)}}
.gl-${id}{animation:gl-${id} 4.5s linear infinite}@keyframes gl-${id}{0%,88%,100%{filter:brightness(1)}93%{filter:brightness(1.9)}}
@media (prefers-reduced-motion: reduce){.gl-${id}{animation:none}}
</style>${cells}</svg>`,
  }
}
