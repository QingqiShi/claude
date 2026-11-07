/** A Raster color: 0x00RRGGBB, or the terminal's own color. */
export type Rgb = number

export const DEFAULT: Rgb = 0x01000000
const NONE = -1

export function rgb(hex: string): Rgb {
  return Number.parseInt(hex.slice(1, 7), 16)
}

/** `a` moved toward `b` by `t`, 0 to 1. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const channel = (shift: number) => {
    const x = (a >> shift) & 0xff
    const y = (b >> shift) & 0xff
    return Math.round(x + (y - x) * t)
  }

  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** Square pixels, two to a terminal cell: the cell's top and bottom halves. */
export type Pixels = { columns: number; height: number; data: Int32Array }

export function pixels(columns: number, height: number): Pixels {
  return { columns, height, data: new Int32Array(columns * height).fill(NONE) }
}

export function setPixel(p: Pixels, x: number, y: number, color: Rgb) {
  if (x < 0 || y < 0 || x >= p.columns || y >= p.height) return
  p.data[y * p.columns + x] = color
}

export function pixelAt(p: Pixels, x: number, y: number): Rgb | null {
  if (x < 0 || y < 0 || x >= p.columns || y >= p.height) return null
  const color = p.data[y * p.columns + x] ?? NONE

  return color === NONE ? null : color
}

/** Cells as Raster takes them, three words to a cell: code point, foreground, background. */
export type Cells = { columns: number; rows: number; words: Uint32Array }

export function blankCells(columns: number, rows: number): Cells {
  const words = new Uint32Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) words.set([32, DEFAULT, DEFAULT], i * 3)

  return { columns, rows, words }
}

export function setCell(cells: Cells, x: number, row: number, glyph: string, fg: Rgb, bg: Rgb) {
  if (x < 0 || row < 0 || x >= cells.columns || row >= cells.rows) return
  cells.words.set([glyph.codePointAt(0) ?? 32, fg, bg], (row * cells.columns + x) * 3)
}

export function backgroundAt(cells: Cells, x: number, row: number): Rgb {
  return cells.words[(row * cells.columns + x) * 3 + 2] ?? DEFAULT
}

export function cellsOf(p: Pixels): Cells {
  const rows = Math.ceil(p.height / 2)
  const cells = blankCells(p.columns, rows)
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < p.columns; x++) {
      const top = pixelAt(p, x, row * 2)
      const bottom = pixelAt(p, x, row * 2 + 1)
      if (top === null && bottom === null) continue
      if (top === bottom) setCell(cells, x, row, ' ', DEFAULT, top!)
      else if (top === null) setCell(cells, x, row, '▄', bottom!, DEFAULT)
      else setCell(cells, x, row, '▀', top, bottom ?? DEFAULT)
    }
  }

  return cells
}

/** Writes ASCII text into the cells. The background stays as it was where `bg` is absent. */
export function putText(cells: Cells, x: number, row: number, text: string, fg: Rgb, bg?: Rgb) {
  ;[...text].forEach((ch, i) => setCell(cells, x + i, row, ch, fg, bg ?? backgroundAt(cells, x + i, row)))
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? BASE64[n & 63]! : '='
  }

  return out
}

/** The Raster `cells` string: the words as little-endian bytes, in base64. */
export function encodeCells(cells: Cells) {
  const bytes = new Uint8Array(cells.words.length * 4)
  const view = new DataView(bytes.buffer)
  cells.words.forEach((word, i) => view.setUint32(i * 4, word, true))

  return base64(bytes)
}

export function decodeCells(encoded: string, columns: number): Cells {
  const clean = encoded.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let acc = 0
  let at = 0
  for (const ch of clean) {
    acc = (acc << 6) | BASE64.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[at++] = (acc >> bits) & 0xff
    }
  }
  const view = new DataView(bytes.buffer)
  const words = new Uint32Array(bytes.length / 4)
  words.forEach((_, i) => (words[i] = view.getUint32(i * 4, true)))

  return { columns, rows: words.length / 3 / columns, words }
}

export type Scheme = 'dark' | 'light'

/**
 * Raster cells cannot use theme keys, so each scheme has its own colors. `bg` is what we expect the
 * terminal background to be; we mix colors onto it to show transparency.
 */
export const INKS: Record<Scheme, { bg: Rgb; track: Rgb; bar: Rgb; empty: Rgb; text: Rgb; dim: Rgb; clay: Rgb }> = {
  dark: {
    bg: rgb('#262624'),
    track: rgb('#3A3A37'),
    bar: rgb('#57554F'),
    empty: rgb('#363633'),
    text: rgb('#ECECEC'),
    dim: rgb('#A6A39B'),
    clay: rgb('#D97757'),
  },
  light: {
    bg: rgb('#FFFFFF'),
    track: rgb('#EAE8E3'),
    bar: rgb('#CFCCC5'),
    empty: rgb('#EBEAE6'),
    text: rgb('#1F1E1D'),
    dim: rgb('#5E5D59'),
    clay: rgb('#C2603F'),
  },
}

export const MERGE_INKS: Record<Scheme, { add: string; del: string; pr: string; prText: string }> = {
  dark: { add: '#3FB950', del: '#F85149', pr: '#A371F7', prText: '#C4A5FA' },
  light: { add: '#1A7F37', del: '#CF222E', pr: '#8250DF', prText: '#6639BA' },
}

/** Terminal cells a text takes: two for a CJK or full-width character, one for any other. */
export function cellWidth(text: string) {
  let width = 0
  for (const ch of text) width += cellsOfChar(ch)

  return width
}

export function cellsOfChar(ch: string) {
  return (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
}
