import { lang } from './i18n'
import { hashOf } from './logic'

export const FONT = "-apple-system, system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"

const GLYPH_EM: Record<string, number> = {
  ' ': 0.33,
  '%': 0.99,
  '.': 0.27,
  ',': 0.27,
  '/': 0.38,
  ':': 0.27,
  $: 0.6,
  '+': 0.61,
  '1': 0.41,
  '7': 0.55,
  '→': 1,
  B: 0.69,
  M: 0.9,
  k: 0.55,
}

export function textWidth(text: string, size: number) {
  let em = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    em += GLYPH_EM[ch] ?? (code >= 0x2e80 ? 1 : 0.6)
  }

  return em * size
}

export function esc(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function uid(...parts: Array<string | number>) {
  return hashOf(...parts)
}

export function svgOpen(width: number, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`
}

export function n(value: number) {
  return Number(value.toFixed(1))
}

/** The host's colors do not reach into an SVG image, so each image carries this palette. */
export function paletteCss(id: string) {
  return `.t1-${id}{fill:#ececec}.t2-${id}{fill:#a6a39b}.t3-${id}{fill:#7a776f}.bg-${id}{fill:rgba(255,255,255,0.055)}.tr-${id}{fill:rgba(255,255,255,0.08)}.bar-${id}{fill:rgba(255,255,255,0.14)}.str-${id}{stroke:rgba(255,255,255,0.08)}
@media (prefers-color-scheme: light){.t1-${id}{fill:#1f1e1d}.t2-${id}{fill:#5e5d59}.t3-${id}{fill:#8a8780}.bg-${id}{fill:rgba(0,0,0,0.045)}.tr-${id}{fill:rgba(0,0,0,0.07)}.bar-${id}{fill:rgba(0,0,0,0.12)}.str-${id}{stroke:rgba(0,0,0,0.08)}}`
}

export function todayCss(id: string) {
  return `.tdp-${id}{animation:tdp-${id} 1.6s ease-in-out infinite}@keyframes tdp-${id}{0%,100%{opacity:1}50%{opacity:.35}}
.tdr-${id}{fill:none;animation:tdr-${id} 1.6s ease-out infinite}@keyframes tdr-${id}{0%{r:3;opacity:1}100%{r:9;opacity:0}}
@media (prefers-reduced-motion: reduce){.tdp-${id}{animation:none}.tdr-${id}{animation:none;opacity:0}}`
}

const memo = new Map<string, unknown>()

export function memoize<T>(name: string, build: () => T): T {
  const key = `${lang()}|${name}`
  if (memo.has(key)) return memo.get(key) as T
  const value = build()
  if (memo.size > 48) memo.delete(memo.keys().next().value as string)
  memo.set(key, value)

  return value
}
