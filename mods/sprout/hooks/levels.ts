export type Level = {
  lv: number
  name: string
  thresholdB: number
  /** The pixel size in the approved 200×140 mockup; the scene scales it. */
  px: number
  /** Rows drawn directly above the 12-row body, 16 columns each. */
  crown: readonly string[]
  isSeed?: boolean
  hasBird?: boolean
  hasPetals?: boolean
  isGold?: boolean
}

export const LEVELS: readonly Level[] = [
  { lv: 1, name: '种子', thresholdB: 0, px: 3, isSeed: true, crown: ['.......G........', '........g.......'] },
  { lv: 2, name: '小苗', thresholdB: 20, px: 3.4, crown: ['.....GG...GG....', '......GGgGG.....', '........g.......'] },
  {
    lv: 3,
    name: '嫩芽',
    thresholdB: 35,
    px: 3.8,
    crown: ['......gg..gg....', '.....gGGggGGg...', '......gggggg....', '........g.......'],
  },
  {
    lv: 4,
    name: '花苞',
    thresholdB: 60,
    px: 4.1,
    crown: [
      '........pp......',
      '.......pPPp.....',
      '.......pPPp.....',
      '....gG.ppp.Gg...',
      '...gGGg.g.gGGg..',
      '....ggggggggg...',
      '........g.......',
    ],
  },
  {
    lv: 5,
    name: '开花',
    thresholdB: 100,
    px: 4.4,
    crown: [
      '......P.P.P.....',
      '.....PPPYPPP....',
      '......PPpPP.....',
      '....gG..g..Gg...',
      '...gGGg.g.gGGg..',
      '....ggggggggg...',
      '........g.......',
    ],
  },
  {
    lv: 6,
    name: '结果',
    thresholdB: 180,
    px: 4.6,
    crown: [
      '......P.P.P.....',
      '.....PPPYPPP....',
      '......PPpPP.....',
      '...rgG..g..Ggr..',
      '..rrGGg.g.gGGrr.',
      '...rgggggggggr..',
      '........g.......',
    ],
  },
  {
    lv: 7,
    name: '小树',
    thresholdB: 320,
    px: 4.8,
    hasBird: true,
    crown: [
      '.....gGGGGg.....',
      '...gGGGGGGGGg...',
      '..gGGgGGGGgGGg..',
      '..gGGGGGGGGGGg..',
      '...ggGGGGGGgg...',
      '.....gggggg.....',
      '.......tt.......',
      '.......tt.......',
      '......tttt......',
    ],
  },
  {
    lv: 8,
    name: '花树',
    thresholdB: 560,
    px: 5,
    hasBird: true,
    hasPetals: true,
    crown: [
      '.....PGPGPP.....',
      '...gPGGpGGPGg...',
      '..PGGPGGPGGpGg..',
      '..gGpGGGGPGGGP..',
      '...ggGGpGGGgg...',
      '.....gggggg.....',
      '.......tt.......',
      '.......tt.......',
      '......tttt......',
    ],
  },
  {
    lv: 9,
    name: '传说金树',
    thresholdB: 1000,
    px: 5.2,
    isGold: true,
    crown: [
      '...h...hh...h...',
      '.....yLLLLy.....',
      '...yLLLLLLLLy...',
      '..yLLwLLLLwLLy..',
      '..yLLLLLLLLLLy..',
      '...yyLLLLLLyy...',
      '.....yyyyyy.....',
      '.......tt.......',
      '.......tt.......',
      '......tttt......',
    ],
  },
]

export const MAX_LEVEL = LEVELS.length

export function levelInfo(lv: number): Level {
  return LEVELS[Math.min(MAX_LEVEL, Math.max(1, lv)) - 1]!
}

export function levelLabel(lv: number) {
  return `Lv${levelInfo(lv).lv} ${levelInfo(lv).name}`
}
