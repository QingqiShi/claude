import { t } from '../hooks/i18n'
import type { SceneDecoration } from '../hooks/scene'

export type SceneEffect = 'rain' | 'pray' | 'umbrella' | 'hide' | 'burp' | 'guard' | 'cup' | 'compact' | 'agents' | 'flower' | 'return' | 'blanket' | 'fail' | null

export type SceneExtras = { effect: SceneEffect; cat: boolean; canPray: boolean; agents: number }
const box = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

function rainSvg(width: number, id: string) {
  return `<g class="rain-${id}" aria-hidden="true" shape-rendering="crispEdges">${Array.from({ length: 24 }, (_, i) => `<rect class="rain-drop-${id}" x="${(i * 47) % width}" y="-12" width="2" height="7" fill="#C4ECFF" style="animation-delay:-${i * .083}s"/>`).join('')}</g>`
}

function extrasSvg(input: SceneExtras & { width: number }, layout: { y0: number; bodyTop: number; s: number }, id: string) {
  let out = ''
  const effect = input.effect
  if (effect === 'umbrella') {
    const y = Math.max(8, layout.y0 - 20)
    out += `<g class="umbrella-${id}" data-effect="umbrella">${box(55,y+8,2,Math.max(18,126-y-12),'#7A5230')}${box(40,y,32,4,'#FFCC70')}${box(33,y+4,46,5,'#F29C50')}${box(29,y+9,54,4,'#D77E43')}${box(29,y+13,7,3,'#FFCC70')}${box(52,y+13,8,3,'#FFCC70')}${box(76,y+13,7,3,'#FFCC70')}</g>`
  }
  if (effect === 'guard') {
    const y = Math.min(110,layout.y0 + 4)
    out += `<g data-effect="guard">${box(38,y,10,5,'#EBD9C2')}${box(65,y,10,5,'#EBD9C2')}${box(45,y-5,4,7,'#FFF4E6')}${box(64,y-5,4,7,'#FFF4E6')}</g>`
  }
  if (effect === 'burp') out += `<g class="burp-${id}" data-effect="burp">${box(76,91,6,2,'#FFF8EC')}${box(79,87,2,4,'#FFF8EC')}${box(83,80,5,2,'#FFF8EC')}</g>`
  // Leave the right-hand visitor spot free while CatGPT is here.
  if (input.cat) out += '<g transform="translate(-87,0)">'
  if (effect === 'cup') out += `<g data-effect="cup">${box(89,112,12,11,'#FFF4E6')}${box(101,114,4,6,'#FFF4E6')}${box(103,116,2,2,'#5AAEE6')}${box(89,111,12,3,'#6B5A48')}<g class="steam-${id}">${box(91,101,2,6,'#FFF8EC')}${box(97,99,2,6,'#FFF8EC')}</g></g>`
  if (effect === 'compact') out += `<g class="note-${id}" data-effect="compact">${box(91,100,20,25,'#6B5A48')}${box(93,99,16,23,'#FFF8EC')}${box(96,104,10,2,'#6B5A48')}${box(96,109,8,2,'#6B5A48')}${box(96,114,10,2,'#6B5A48')}${box(98,96,3,5,'#3F8F4A')}</g>`
  if (effect === 'agents') {
    for (let i=0;i<Math.min(3,Math.max(1,input.agents ?? 1));i++) out += `<g class="mini-${id}" data-effect="agent" style="animation-delay:${i*.2}s">${box(94+i*9,116,8,9,'#FFF4E6')}${box(95+i*9,118,2,2,'#2E2420')}${box(99+i*9,118,2,2,'#2E2420')}${box(98+i*9,112,2,4,'#3F8F4A')}${box(95+i*9,110,5,3,'#8FD17A')}</g>`
  }
  if (effect === 'flower') out += `<g class="flower-${id}" data-effect="flower">${box(104,111,2,15,'#3F8F4A')}${box(99,117,5,3,'#8FD17A')}${box(100,104,10,10,'#F9A8D4')}${box(97,107,16,4,'#F9A8D4')}${box(103,107,4,4,'#FFE066')}</g>`
  if (effect === 'fail') out += `<g class="steam-${id}" data-effect="fail">${box(91,96,4,12,'#D4664B')}${box(91,112,4,4,'#D4664B')}</g>`
  if (input.cat) out += '</g>'
  if (effect === 'blanket') {
    const y = Math.min(119, layout.bodyTop + 7 * layout.s)
    out += `<g data-effect="blanket">${box(39,y,34,Math.max(5,126-y),'#7C91C1')}${box(39,y,34,3,'#BAC9E6')}${box(44,y+3,3,3,'#BAC9E6')}${box(65,y+3,3,3,'#BAC9E6')}</g>`
  }
  if (input.cat) {
    const pixels = ['.gg.......gg..','gGGg.....gGGg.','gGGGGGGGGGGGg.','.gGGGGGGGGGg..','.gGEEGGEEGGg..','.gGGGppGGGGg..','..ggGGGGGgg..g','...gGGGGGg..gg','...gGGGGGgggg.','...ggg.ggg....']
    const colors: Record<string,string> = { g:'#5B5965',G:'#B6B2C3',E:'#24202C',p:'#E9A2AE' }
    const body = pixels.map((row,y)=>[...row].map((ch,x)=>colors[ch] ? box(94+x*1.8,106+y*1.8,1.85,1.85,colors[ch]) : '').join('')).join('')
    out += `<g class="scene-hotspot cat-${id}" data-action="cat" role="button" tabindex="0" aria-label="${t('和 CatGPT 打招呼', 'Say hi to CatGPT')}"><title>${t('CatGPT · 点我', 'CatGPT · click me')}</title><rect class="hit-area" x="91" y="99" width="36" height="27" rx="3" fill="transparent"/>${body}</g>`
  }
  if (input.canPray || effect === 'pray') {
    const x = Math.round(input.width*.36)
    out += `<g class="scene-hotspot cloud-${id}" data-action="pray" role="button" tabindex="0" aria-label="${t('向 Tibo 求雨', 'Ask Tibo for rain')}"><title>${t('向 Tibo 求雨', 'Ask Tibo for rain')}</title><rect class="hit-area" x="${x-6}" y="7" width="42" height="29" rx="3" fill="transparent"/>${box(x,22,30,6,'#F4FBFF')}${box(x+9,16,12,6,'#F4FBFF')}</g>`
  }
  return `<g shape-rendering="crispEdges">${out}</g>`
}

function extrasCss(id: string) {
  return `<style>
@keyframes rain-${id}{from{transform:translate(0,0)}to{transform:translate(-12px,150px)}}
@keyframes hide-${id}{0%{transform:translateY(0)}15%,80%{transform:translateY(150px)}100%{transform:translateY(0)}}
@keyframes return-${id}{0%{transform:translateY(110px)}20%{transform:translateY(110px)}50%,100%{transform:translateY(0)}}
@keyframes steam-${id}{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-4px);opacity:1}}
@keyframes note-${id}{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.rain-drop-${id}{animation:rain-${id} .9s linear infinite}
.hide-${id}{animation:hide-${id} 2.8s steps(6) both}
.return-${id}{animation:return-${id} 2s steps(6) both}
.steam-${id},.burp-${id}{animation:steam-${id} 1.5s steps(3) infinite}
.note-${id}{animation:note-${id} 1.4s steps(3) infinite;transform-origin:100px 123px}
.mini-${id},.flower-${id},.cat-${id}{animation:hop-${id} 1.8s steps(3) infinite}
.scene-hotspot{cursor:pointer;outline:none}.scene-hotspot:focus-visible .hit-area{stroke:#fff;stroke-width:2}
@media(prefers-reduced-motion:reduce){.rain-drop-${id}{animation:none;transform:translateY(65px)}.hide-${id},.return-${id},.steam-${id},.burp-${id},.note-${id},.mini-${id},.flower-${id},.cat-${id}{animation:none}.hide-${id}{transform:translateY(150px)}}
</style>`
}

/** What Codex adds to the scene of the mod. Everything stays inside the scene's own 150px. */
export function decorationFor(extras: SceneExtras, width: number): SceneDecoration {
  const { effect } = extras
  const atlas = t('成长图鉴', 'Growth atlas')

  return {
    css: extrasCss,
    bodyClass: effect === 'pray' ? 'party' : undefined,
    belowPet: id => (effect === 'rain' ? rainSvg(width, id) : ''),
    abovePet: (layout, id) => extrasSvg({ ...extras, width }, layout, id),
    pet: (markup, id) =>
      effect === 'hide' || effect === 'return' ? `<g clip-path="url(#soil-${id})"><g class="${effect}-${id}" data-effect="${effect}">${markup}</g></g>` : markup,
    level: (markup, x, w) =>
      `<g class="scene-hotspot" data-action="atlas" role="button" tabindex="0" aria-label="${atlas}"><title>${atlas}</title>${markup}<rect class="hit-area" x="${x}" y="128" width="${Math.round(w)}" height="22" rx="2" fill="transparent"/></g>`,
  }
}
