import type { SproutDay, SproutMergeDay } from '../types'
import { dayFromNumber, dayNumber, formatLines, formatTokens, formatUsd, mergeTotals, monthLabel, weekdayOf } from './logic'
import { t } from './i18n'
import { esc, n, paletteCss, svgOpen, textWidth, todayCss, uid } from './svg-kit'

export const LEVELS = {
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
  const end = isOut ? t('用完了', 'Used up') : fc === null ? '' : isOver ? t(`超 ${Math.round(fc - 100)}%`, `${Math.round(fc - 100)}% over`) : `→ ${Math.round(fc)}%`
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

function rollText(id: string, x: number, y: number, size: number, text: string, from: RollFrom, cls: string, delay: number, isIntro: boolean) {
  const lh = Math.round(size * 1.25)
  const fromChars = from !== null && from.length === text.length ? [...from] : null
  let cx = x
  let out = ''
  let digitIndex = 0
  for (const [i, ch] of [...text].entries()) {
    const w = textWidth(ch, size)
    if (isIntro && /\d/.test(ch)) {
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

  return { svg: out, width: cx - x, clip: isIntro ? `<clipPath id="line-${id}-${Math.round(y)}"><rect x="0" y="${n(y - size)}" width="10000" height="${n(size * 1.3)}"/></clipPath>` : '' }
}

export type TilesInput = {
  width: number
  tokensLabel: string
  tokens: number
  costUsd: number
  todayUsd: number
  streak: number
  week: boolean[]
  cacheHitRate: number
  bars: number[]
  previous: { tokens: number; costUsd: number; cacheHitRate: number } | null
  isIntro: boolean
}

export const TILE_HEIGHT = 54

export function tilesHeight() {
  return TILE_HEIGHT * 2 + 8
}

export function tilesSvg(input: TilesInput) {
  const W = input.width
  const H = tilesHeight()
  const id = uid('tiles', JSON.stringify(input))
  const { isIntro } = input
  const tw = (W - 8) / 2
  const th = TILE_HEIGHT
  const tokens = formatTokens(input.tokens)
  const cost = formatUsd(input.costUsd)
  const hit = `${(input.cacheHitRate * 100).toFixed(1)}%`
  const prev = input.previous
  const clips: string[] = []
  const tile = (col: number, row: number, label: string, value: string, from: RollFrom, suffix: string, extra: (x: number, y: number) => string, delay: number) => {
    const x = col * (tw + 8)
    const y = row * (th + 8)
    const rolled = rollText(id, x + 10, y + th - 12, 20, value, from, `num-${id}`, delay, isIntro)
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
        const grow = isIntro ? ` grow-${id}` : ''
        const delay = isIntro ? ` style="animation-delay:${(0.3 + i * 0.04).toFixed(2)}s"` : ''
        return `<rect class="${isToday ? `today-${id}` : `bar-${id}`}${grow}"${delay} x="${x}" y="${n(bottom - h)}" width="3" height="${n(h)}" rx="1"/>`
      })
      .join('')
  }
  const pill = (right: number, bottom: number) => {
    if (input.todayUsd <= 0) return ''
    const label = `+${formatUsd(input.todayUsd)}`
    const w = textWidth(label, 12) + 14
    return `<g${isIntro ? ` class="fade-${id}"` : ''}><rect x="${n(right - w)}" y="${bottom - 18}" width="${n(w)}" height="18" rx="9" fill="rgba(217,119,87,0.16)"/><text x="${n(right - w / 2)}" y="${bottom - 5}" text-anchor="middle" font-size="12" class="clay-${id}">${esc(label)}</text></g>`
  }
  const week = (right: number, bottom: number) =>
    input.week
      .map((isOn, i) => {
        const x = right - (input.week.length - i) * 8 + 2
        const isToday = i === input.week.length - 1
        return `<rect x="${x}" y="${bottom - 7}" width="6" height="6" rx="1.5" class="${isOn ? `on-${id}` : `tr-${id}`}${isToday ? ` tdp-${id}` : ''}"/>`
      })
      .join('')
  const ring = (right: number, bottom: number) => {
    const cx = right - 15
    const cy = bottom - 15
    const c = 2 * Math.PI * 12
    const off = c * (1 - Math.max(0, Math.min(1, input.cacheHitRate)))
    return `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke-width="4" class="str-${id}"/><circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="url(#rg-${id})" stroke-width="4" stroke-linecap="round" stroke-dasharray="${n(c)}" stroke-dashoffset="${n(off)}" transform="rotate(-90 ${cx} ${cy})"${isIntro ? ` class="ring-${id}"` : ''}/>`
  }

  const body =
    tile(0, 0, input.tokensLabel, tokens, prev === null ? null : formatTokens(prev.tokens), '', bars, 0) +
    tile(1, 0, t('按 API 价估算', 'At API prices'), cost, prev === null ? null : formatUsd(prev.costUsd), '', pill, 0.1) +
    tile(0, 1, t('连续使用', 'Streak'), String(input.streak), null, t('天', 'days'), week, 0.2) +
    tile(1, 1, t('缓存命中', 'Cache hits'), hit, prev === null ? null : `${(prev.cacheHitRate * 100).toFixed(1)}%`, '', ring, 0.3)
  const c = 2 * Math.PI * 12
  const intro = isIntro
    ? `
.roll-${id}{animation:roll-${id} 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes roll-${id}{from{transform:translateY(var(--f))}to{transform:translateY(var(--t))}}
.grow-${id}{transform-box:fill-box;transform-origin:center bottom;animation:grow-${id} .5s cubic-bezier(.3,1.3,.5,1) both}
@keyframes grow-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.fade-${id}{animation:fade-${id} .5s ease-out .6s both}@keyframes fade-${id}{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.ring-${id}{animation:ring-${id} 1.4s cubic-bezier(.2,.8,.2,1)}@keyframes ring-${id}{from{stroke-dashoffset:${n(c)}}}
@media (prefers-reduced-motion: reduce){.roll-${id},.grow-${id},.fade-${id},.ring-${id}{animation:none}}`
    : ''

  return `${svgOpen(W, H)}<style>${paletteCss(id)}
.num-${id}{fill:#ececec;font-size:20px;font-weight:500}@media (prefers-color-scheme: light){.num-${id}{fill:#1f1e1d}}
.today-${id},.on-${id}{fill:#D97757}.clay-${id}{fill:#E8906F}@media (prefers-color-scheme: light){.clay-${id}{fill:#B4532F}}${intro}
${todayCss(id)}
</style><defs><linearGradient id="rg-${id}" x1="0" x2="1"><stop offset="0" stop-color="#F0997B"/><stop offset="1" stop-color="#D97757"/></linearGradient>${clips.join('')}</defs>${body}</svg>`
}

export const TREND_HEIGHT = 84

export function movingAverage(values: readonly number[]) {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((a, b) => a + b, 0) / win.length
  })
}

export function trendStats(values: readonly number[]) {
  return { peak: Math.max(0, ...values), average: movingAverage(values).at(-1) ?? 0 }
}

export function trendSvg(width: number, days: readonly SproutDay[], isIntro: boolean) {
  const W = width
  const H = TREND_HEIGHT
  const T = 18
  const values = days.map(d => d.tokens)
  const id = uid('trend', W, values.join(','))
  if (values.length === 0) return null
  const max = Math.max(1, ...values)
  const bw = W / values.length
  const Y = (v: number) => H - (v / max) * (H - T)
  const avg = movingAverage(values)
  const pts = avg.map((v, i) => [i * bw + bw / 2, Y(v)] as const)
  const line = pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')
  const last = pts.at(-1) ?? [W, H]
  const step = values.length > 60 ? 0 : 12
  const bars = values
    .map((v, i) => {
      const h = H - Y(v)
      if (h <= 0) return ''
      const attrs = isIntro ? ` class="bar-${id} pop-${id}" style="animation-delay:${i * step}ms"` : ` class="bar-${id}"`
      return `<rect${attrs} x="${n(i * bw + bw * 0.2)}" y="${n(Y(v))}" width="${n(Math.max(0.6, bw * 0.6))}" height="${n(h)}" rx="${bw > 4 ? 1 : 0}"/>`
    })
    .join('')
  const stats = trendStats(values)
  const peak = t(`峰值 ${formatTokens(stats.peak)}`, `Peak ${formatTokens(stats.peak)}`)
  const now = t(`7 日均线 ${formatTokens(stats.average)}`, `7-day avg ${formatTokens(stats.average)}`)
  const draw = isIntro ? ` class="draw-${id}"` : ''
  const intro = isIntro
    ? `
.pop-${id}{transform-box:fill-box;transform-origin:center bottom;animation:pop-${id} .35s cubic-bezier(.3,1.6,.5,1) backwards}
@keyframes pop-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.draw-${id}{stroke-dasharray:1;animation:draw-${id} 1.3s ease-out backwards}@keyframes draw-${id}{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@media (prefers-reduced-motion: reduce){.pop-${id},.draw-${id}{animation:none}}`
    : ''

  return `${svgOpen(W, H)}<style>${paletteCss(id)}${intro}
${todayCss(id)}
.clay-${id}{fill:#E8906F}@media (prefers-color-scheme: light){.clay-${id}{fill:#B4532F}}
</style><defs><linearGradient id="ar-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D97757" stop-opacity=".45"/><stop offset="1" stop-color="#D97757" stop-opacity="0"/></linearGradient></defs>
${bars}
<path d="M${n(pts[0]?.[0] ?? 0)},${H} L${line} L${n(last[0])},${H}Z" fill="url(#ar-${id})"/>
<path${draw} d="M${line}" fill="none" stroke="#F0997B" stroke-width="5" stroke-opacity=".25" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>
<path${draw} d="M${line}" fill="none" stroke="#D97757" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/>
<circle class="tdr-${id}" cx="${n(Math.min(W - 4, last[0]))}" cy="${n(last[1])}" r="3" stroke="#D97757"/><circle cx="${n(Math.min(W - 4, last[0]))}" cy="${n(last[1])}" r="3" fill="#D97757"/>
<text x="0" y="11" font-size="11" class="t3-${id}">${peak}</text><text x="${W}" y="11" text-anchor="end" font-size="11" class="clay-${id}">${now}</text>
</svg>`
}

export const MERGES_HEIGHT = 96

export function mergesSvg(width: number, days: readonly SproutMergeDay[], isIntro: boolean) {
  const W = width
  const H = MERGES_HEIGHT
  const T = 18
  const D = 12
  const id = uid('merges', W, days.map(d => `${d.prs}:${d.additions}:${d.deletions}`).join(','))
  if (days.length === 0) return null
  const base = H - D - 3
  const peak = Math.sqrt(Math.max(0, ...days.map(d => d.additions + d.deletions)))
  const scale = peak > 0 ? (base - T) / peak : 0
  const bw = W / days.length
  const prMax = Math.max(1, ...days.map(d => d.prs))
  const step = days.length > 60 ? 0 : 12
  const last = days.length - 1
  const x0 = (i: number) => n(i * bw + bw * 0.2)
  const w = n(Math.max(0.6, bw * 0.6))
  const r = bw > 4 ? 1 : 0
  const now = (i: number) => (i === last ? ` now-${id}` : '')
  const cx = (i: number) => n(Math.min(W - 4, i * bw + bw / 2))
  const delay = (i: number) => (isIntro ? ` style="animation-delay:${i * step}ms"` : '')
  const segment = (cls: string, i: number, y: number, h: number, isTop: boolean) => {
    const c = `${cls}-${id}${now(i)}`
    if (!isTop || r === 0 || h < 2 * r) return `<rect class="${c}" x="${x0(i)}" y="${n(y)}" width="${w}" height="${n(h)}"/>`
    const x = x0(i)

    return `<path class="${c}" d="M${x},${n(y + h)}V${n(y + r)}Q${x},${n(y)} ${n(x + r)},${n(y)}H${n(x + w - r)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}V${n(y + h)}Z"/>`
  }
  const dotY = H - D / 2
  let marks = `<rect class="bg-${id}" x="${n(last * bw)}" y="${T - 4}" width="${n(bw)}" height="${H - T + 4}" rx="2"/>`
  for (const [i, d] of days.entries()) {
    const total = d.additions + d.deletions
    if (total > 0) {
      const h = Math.max(1.5, Math.sqrt(total) * scale)
      const add = (h * d.additions) / total
      const bar = segment('add', i, base - add, add, d.deletions === 0) + (d.deletions === 0 ? '' : segment('del', i, base - h, h - add, true))
      marks += `<g${isIntro ? ` class="up-${id}"` : ''}${delay(i)}>${bar}</g>`
    }
    if (d.prs > 0) {
      const radius = n(Math.min(bw * 0.42, 1.4 + 2.6 * Math.sqrt(d.prs / prMax)))
      marks += `<circle class="pr-${id}${now(i)}${isIntro ? ` pop-${id}` : ''}"${delay(i)} cx="${cx(i)}" cy="${dotY}" r="${radius}"/>`
    }
  }
  const today = days[last]
  const todayX = cx(last)
  const empty = today !== undefined && today.prs > 0 ? '' : `<circle class="prs-${id}" cx="${todayX}" cy="${dotY}" r="2.5" fill="none" stroke-width="1"/>`
  const pulse = `${empty}<circle class="prs-${id} tdr-${id}" cx="${todayX}" cy="${dotY}" r="3"/>`
  const sum = mergeTotals(days)
  const keys = [
    { cls: `add-${id}`, label: t('新增', 'Added'), value: `+${formatLines(sum.additions)}`, isDot: false },
    { cls: `del-${id}`, label: t('删除', 'Removed'), value: `−${formatLines(sum.deletions)}`, isDot: false },
    { cls: `pr-${id}`, label: 'PR', value: '', isDot: true },
  ]
  let legend = ''
  let lx = 0
  for (const k of keys) {
    legend += k.isDot ? `<circle class="${k.cls}" cx="${n(lx + 5)}" cy="7" r="4"/>` : `<rect class="${k.cls}" x="${n(lx)}" y="2" width="10" height="10" rx="2.5"/>`
    const text = k.value === '' ? k.label : `${k.label} ${k.value}`
    legend += `<text x="${n(lx + 13)}" y="11" font-size="11" class="t3-${id}">${k.label}${k.value === '' ? '' : `<tspan class="t2-${id}"> ${esc(k.value)}</tspan>`}</text>`
    lx += 13 + textWidth(text, 11) + 10
  }
  const legendRight = lx - 10
  const parts: Array<Array<[string, string]>> =
    today === undefined || today.prs === 0
      ? [[[`t3-${id}`, t('今天还没合并', 'No merges today')]]]
      : [
          [
            [`prt-${id}`, t(`今天 ${today.prs} 个`, `${today.prs} today`)],
            [`addt-${id}`, ` +${formatLines(today.additions)}`],
            [`delt-${id}`, ` −${formatLines(today.deletions)}`],
          ],
          [[`prt-${id}`, t(`今天 ${today.prs} 个`, `${today.prs} today`)]],
        ]
  const fit = parts.find(p => legendRight + 12 + textWidth(p.map(([, text]) => text).join(''), 11) <= W)
  const right =
    fit === undefined
      ? ''
      : `<text x="${W}" y="11" text-anchor="end" font-size="11">${fit.map(([cls, text]) => `<tspan class="${cls}">${esc(text)}</tspan>`).join('')}</text>`
  const motion = isIntro
    ? `
.up-${id}{transform-box:fill-box;transform-origin:center bottom;animation:grow-${id} .4s cubic-bezier(.3,1.5,.5,1) backwards}
@keyframes grow-${id}{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.pop-${id}{transform-box:fill-box;transform-origin:center;animation:pop-${id} .35s cubic-bezier(.3,1.6,.5,1) .2s backwards}
@keyframes pop-${id}{from{transform:scale(0)}to{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.up-${id},.pop-${id}{animation:none}}`
    : ''

  return `${svgOpen(W, H)}<style>${paletteCss(id)}
.add-${id}{fill:#3FB950;opacity:.7}.del-${id}{fill:#F85149;opacity:.7}.pr-${id}{fill:#A371F7;opacity:.8}.now-${id}{opacity:1}
.addt-${id}{fill:#3FB950}.delt-${id}{fill:#F85149}.prt-${id}{fill:#C4A5FA}.axis-${id}{stroke:rgba(255,255,255,0.16)}.prs-${id}{stroke:#A371F7}
@media (prefers-color-scheme: light){.add-${id},.addt-${id}{fill:#1A7F37}.del-${id},.delt-${id}{fill:#CF222E}.pr-${id}{fill:#8250DF}.prt-${id}{fill:#6639BA}.axis-${id}{stroke:rgba(0,0,0,0.14)}.prs-${id}{stroke:#8250DF}}${motion}
${todayCss(id)}
</style>${legend}${right}<line class="axis-${id}" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke-width="1"/>${marks}${pulse}</svg>`
}

export type Ramp = { dark: readonly string[]; light: readonly string[]; ring: { dark: string; light: string } }

export const CLAY: Ramp = {
  dark: ['#62301F', '#93442A', '#C8603F', '#F0997B'],
  light: ['#F5C4B3', '#F0997B', '#D97757', '#993C1D'],
  ring: { dark: '#D97757', light: '#D97757' },
}

export const GREEN: Ramp = {
  dark: ['#0E4429', '#006D32', '#26A641', '#39D353'],
  light: ['#9BE9A8', '#40C463', '#30A14E', '#216E39'],
  ring: { dark: '#39D353', light: '#1A7F37' },
}

type Entrance = { name: string; css: (id: string) => string; delay: (column: number, row: number) => number }

const POP: Entrance = {
  name: 'pop',
  css: id => `.pop-${id}{transform-box:fill-box;transform-origin:center;animation:pop-${id} .35s cubic-bezier(.3,1.6,.5,1) backwards}
@keyframes pop-${id}{from{transform:scale(0)}to{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.pop-${id}{animation:none}}`,
  delay: (c, r) => c * 12 + r * 8,
}

const GLINT: Entrance = {
  name: 'gl',
  css: id => `.gl-${id}{animation:gl-${id} .7s ease-out}@keyframes gl-${id}{0%,100%{filter:brightness(1)}40%{filter:brightness(1.9)}}
@media (prefers-reduced-motion: reduce){.gl-${id}{animation:none}}`,
  delay: c => c * 25,
}

export const HEAT_WEEKS = 53

function heatmapSvg(width: number, today: string, ramp: Ramp, levelOn: LevelOn, entrance: Entrance | null, key: string) {
  const W = width
  const ringOut = 2.75
  const pitch = (W - ringOut) / (HEAT_WEEKS - 1 + 14 / 17)
  const cell = pitch * (14 / 17)
  const radius = n(cell * 0.25)
  const gridRight = (HEAT_WEEKS - 1) * pitch + cell
  const todayN = dayNumber(today)
  const startN = todayN - weekdayOf(today) - (HEAT_WEEKS - 1) * 7
  const top = 18
  const H = Math.ceil(top + 7 * pitch + 18)
  const id = uid('heat', W, today, key, entrance?.name ?? '')
  let cells = ''
  const starts: Array<{ x: number; label: string }> = []
  for (let c = 0; c < HEAT_WEEKS; c++) {
    const colStart = startN + c * 7
    for (let r = 0; r < 7; r++) {
      const dn = colStart + r
      if (dn > todayN) continue
      const level = levelOn(dn)
      const classes = `k${level ?? 0}-${id}${level === null ? ` nd-${id}` : ''}${entrance === null ? '' : ` ${entrance.name}-${id}`}`
      const delay = entrance === null ? '' : ` style="animation-delay:${entrance.delay(c, r)}ms"`
      cells += `<rect class="${classes}"${delay} x="${n(c * pitch)}" y="${n(top + r * pitch)}" width="${n(cell)}" height="${n(cell)}" rx="${radius}"/>`
      if (dn === todayN) {
        cells += `<rect class="ring-${id} tdp-${id}" x="${n(c * pitch - 2)}" y="${n(top + r * pitch - 2)}" width="${n(cell + 4)}" height="${n(cell + 4)}" rx="${n(cell * 0.3 + 1.5)}" fill="none" stroke-width="1.5"/>`
      }
    }
    const first = Array.from({ length: 7 }, (_, r) => dayFromNumber(colStart + r)).find(day => day.endsWith('-01'))
    if (first !== undefined) starts.push({ x: c * pitch, label: monthLabel(Number(first.slice(5, 7))) })
  }
  const place = (labels: typeof starts) => {
    let freeX = 0
    const placed: typeof starts = []
    for (const { x, label } of labels) {
      const at = Math.min(x, W - textWidth(label, 11))
      if (at < freeX) continue
      placed.push({ x: at, label })
      freeX = at + textWidth(label, 11) + 6
    }
    return placed
  }
  const every = place(starts)
  const shown = every.length === starts.length ? every : place(starts.filter((_, i) => (starts.length - 1 - i) % 2 === 0))
  const months = shown.map(({ x, label }) => `<text x="${n(x)}" y="11" font-size="11" class="t3-${id}">${label}</text>`).join('')
  const less = t('少', 'Less')
  const more = t('多', 'More')
  const lessW = textWidth(less, 11) + 3
  const legendW = lessW + 5 * 12 + 2 + textWidth(more, 11)
  const lx = gridRight - legendW
  const ly = H - 12
  const legend = `<text x="${n(lx)}" y="${ly + 9}" font-size="11" class="t3-${id}">${less}</text>${[0, 1, 2, 3, 4]
    .map(k => `<rect class="k${k}-${id}" x="${n(lx + lessW + k * 12)}" y="${ly}" width="10" height="10" rx="2.5"/>`)
    .join('')}<text x="${n(lx + lessW + 5 * 12 + 2)}" y="${ly + 9}" font-size="11" class="t3-${id}">${more}</text>`
  const kinds = (colors: readonly string[]) => colors.map((color, i) => `.k${i + 1}-${id}{fill:${color}}`).join('')

  return {
    height: H,
    svg: `${svgOpen(W, H)}<style>${paletteCss(id)}
.k0-${id}{fill:rgba(255,255,255,0.08)}${kinds(ramp.dark)}.ring-${id}{stroke:${ramp.ring.dark}}.nd-${id}{opacity:.35}
@media (prefers-color-scheme: light){.k0-${id}{fill:rgba(0,0,0,0.07)}${kinds(ramp.light)}.ring-${id}{stroke:${ramp.ring.light}}}
${entrance === null ? '' : entrance.css(id)}
${todayCss(id)}
</style>${months}${cells}${legend}</svg>`,
  }
}

/** The heat level 0 to 4 of a day number, or null before the first day with data. */
export type LevelOn = (day: number) => number | null

export function usageLevels(days: readonly SproutDay[], firstDay: string): LevelOn {
  const tokens = new Map(days.map(d => [dayNumber(d.day), d.tokens]))
  const max = Math.max(1, ...days.map(d => d.tokens))
  const firstN = dayNumber(firstDay)

  return dn => {
    if (dn < firstN) return null
    const v = tokens.get(dn) ?? 0

    return v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.99))
  }
}

/** `levels` holds one digit per day from `start` on, as GitHub's contribution calendar gives them. */
export function githubLevels(start: string, levels: string): LevelOn {
  const startN = dayNumber(start)

  return dn => (dn < startN ? null : Number(levels[dn - startN] ?? '0'))
}

export function usageHeatmapSvg(width: number, days: readonly SproutDay[], firstDay: string, today: string, isIntro: boolean) {
  return heatmapSvg(width, today, CLAY, usageLevels(days, firstDay), isIntro ? POP : null, `${firstDay}|${days.map(d => `${d.day}:${d.tokens}`).join(',')}`)
}

export function githubHeatmapSvg(width: number, start: string, levels: string, today: string, isIntro: boolean) {
  return heatmapSvg(width, today, GREEN, githubLevels(start, levels), isIntro ? GLINT : null, `${start}|${levels}`)
}
