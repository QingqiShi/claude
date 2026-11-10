// The pane of the mod as HTML, for Codex's side panel. It draws the same sections with the same SVG as register.tsx.
import type { EngineInterface } from 'claude-code'

import type { SproutIntroKind } from '../types'
import type { Host } from '../hooks/host'
import { t } from '../hooks/i18n'
import { LEVELS, levelInfo, levelLabel } from '../hooks/levels'
import { addDays, agoText, formatTokens, formatUsd } from '../hooks/logic'
import type { Model } from '../hooks/model'
import {
  STALE_QUOTA_MS,
  forecastText,
  githubText,
  introsFor,
  mergedText,
  rangeText,
  readModel,
  resetText,
  sceneInputFor,
  tilesInputFor,
  title,
  trendDays,
  trendText,
  usedText,
} from '../hooks/model'
import { capsuleSvg, githubHeatmapSvg, levelOf, mergesSvg, tilesSvg, trendSvg, usageHeatmapSvg } from '../hooks/panels'
import { portraitSvg, sceneSvg } from '../hooks/scene'
import { esc, memoize } from '../hooks/svg-kit'
import { sceneOf } from './pet'
import { decorationFor } from './scene'

const PANE_MAX = 512
const PANE_PADDING = 32

/** The SVG is drawn this wide and the panel scales it to fit, as the desktop pane of Claude Code does. */
export function drawingWidth(paneWidth: number) {
  return Math.max(312, Math.min(480, Math.round(((Math.min(PANE_MAX, paneWidth) - PANE_PADDING) * 0.8) / 4) * 4))
}

const section = (left: string, right: string, body: string) => `<section><div class="head"><h2>${esc(left)}</h2>${right}</div>${body}</section>`
const note = (text: string) => `<span class="note">${esc(text)}</span>`
const chart = (svg: string, label: string) => `<div class="chart" role="img" aria-label="${esc(label)}">${svg}</div>`
const button = (action: string, label: string, attrs = '') => `<button data-action="${action}"${attrs}>${esc(label)}</button>`

function sceneHtml(model: Model, width: number) {
  const { mood, extras } = sceneOf(model)
  const input = { ...sceneInputFor(model, width), mood, isConfetti: (model.party !== null || model.isLevelUp) && mood === 'party' }
  const svg = memoize(`codex-scene|${JSON.stringify([input, extras])}`, () => sceneSvg({ ...input, decoration: decorationFor(extras, width) }))
  const label = t(`小苗，${levelLabel(model.level)}：${model.text}`, `Miao, ${levelLabel(model.level)}: ${model.text}`)
  const tokens = model.scan === null ? '' : `\n${t('累计', 'All-time')} ${formatTokens(model.scan.totals.tokens)} token`

  return `<div class="scene" role="group" aria-label="${esc(label)}" title="${esc(model.text + tokens)}">${svg}</div>`
}

function quotaHtml(model: Model, width: number) {
  const isStale = model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS
  const stale = isStale && model.quota.at !== null ? note(t(`更新于 ${agoText(model.quota.at, model.now)}`, `Updated ${agoText(model.quota.at, model.now)}`)) : ''
  const windows = model.windows.map(w => {
    const projected = w.forecast === null ? null : Math.round(w.forecast.projected)
    const sentence = forecastText(w, model.now, model.tz)
    const svg = memoize(`cap|${width}|${w.limit.pct}|${projected ?? -1}`, () => capsuleSvg(width, w.limit.pct, projected))
    const used = t(`${w.label}已用 ${Math.round(w.limit.pct)}%`, `${w.label}: ${Math.round(w.limit.pct)}% used`)
    const warning = levelOf(w.limit.pct, projected) === 'over' ? ' over' : ''

    return `<div class="window"><div class="head">${note(w.label)}${note(resetText(w, model.now, model.tz))}</div>${chart(svg, used)}${sentence === null ? '' : `<p class="note${warning}">${esc(sentence)}</p>`}</div>`
  })
  const empty = `<p class="note">${esc(t('还没有额度读数。用订阅账号登录 Codex CLI，我就看得到了。', 'No quota reading yet. Sign in to the Codex CLI with a subscription account and I will see it.'))}</p>`

  return section(t('额度', 'Quota'), stale, windows.join('') || empty)
}

/** The whole panel as sections with a key each, so that the page replaces only the ones that changed. */
export async function panelHtml($: EngineInterface, host: Host, paneWidth: number, project: string | null) {
  const model = await readModel($, host)
  const width = drawingWidth(paneWidth)
  const scan = model.scan
  const firstDay = scan?.firstDay ?? null
  const github = model.github
  const trend = trendDays(model)
  const used = usedText(model)
  const tilesInput = tilesInputFor(model, width)
  const drawings: Record<SproutIntroKind, string | null> = {
    tiles: tilesInput === null ? null : `tiles|${JSON.stringify(tilesInput)}`,
    trend: trend.length < 2 ? null : `trend|${width}|${trend.map(d => d.tokens).join(',')}`,
    merges: model.merged.prs === 0 ? null : `merges|${width}|${model.mergeDays.map(d => `${d.prs}:${d.additions}:${d.deletions}`).join(',')}`,
    clay: scan === null || firstDay === null ? null : `clay|${width}|${model.today}|${firstDay}|${scan.days.map(d => `${d.day}:${d.tokens}`).join(',')}`,
    github: github === null ? null : `gh|${width}|${model.today}|${github.start}|${github.levels}`,
  }
  const intro = await introsFor($, model.today, drawings)
  const drawn = <T>(kind: SproutIntroKind, build: (isIntro: boolean) => T) => memoize(`${drawings[kind]}|${intro.has(kind)}`, () => build(intro.has(kind)))

  const sections = [
    { key: 'header', html: `<header><span class="dot" aria-hidden="true"></span><h1>${esc(title())}</h1>${button('refresh', project ?? '', ` class="plain project" title="${esc(t('点击刷新', 'Click to refresh'))}" aria-label="${esc(t('刷新', 'Refresh'))}"`)}</header>` },
    { key: 'pet', html: `<div class="pet">${sceneHtml(model, width)}<div class="actions">${button('feed', t('喂水', 'Water'))}${button('pat', t('摸摸', 'Pat'))}${button('roast', t('再嘴一句', 'Roast me'))}</div></div>` },
    { key: 'quota', html: quotaHtml(model, width) },
  ]
  if (scan === null || firstDay === null || tilesInput === null) {
    sections.push({ key: 'loading', html: `<p class="note">${esc(t('正在翻你的聊天记录，第一次要一两分钟。', 'Reading your chat history. The first time takes a minute or two.'))}</p>` })
  } else {
    const pressed = (range: string) => ` class="plain" aria-pressed="${model.range === range}"`
    const range = `<div class="range">${button('range-30', t('30 天', '30 days'), pressed('30'))}${button('range-all', t('全部', 'All'), pressed('all'))}</div>`
    const label = t(
      `${rangeText(model)}：${formatTokens(tilesInput.tokens)} token，按 API 价格估算 ${formatUsd(tilesInput.costUsd)}；连续使用 ${model.streak} 天；缓存命中 ${(tilesInput.cacheHitRate * 100).toFixed(1)}%`,
      `${rangeText(model)}: ${formatTokens(tilesInput.tokens)} tokens, ${formatUsd(tilesInput.costUsd)} at API prices; ${model.streak}-day streak; ${(tilesInput.cacheHitRate * 100).toFixed(1)}% cache hits`,
    )
    sections.push({ key: 'stats', html: section(rangeText(model), range, chart(drawn('tiles', isIntro => tilesSvg({ ...tilesInput, isIntro })), label)) })
  }
  if (drawings.trend !== null) {
    const label = t(`每日 token，最近 ${trend.length} 天，${trendText(trend)}`, `Daily tokens, last ${trend.length} days, ${trendText(trend)}`)
    sections.push({ key: 'trend', html: section(t('每日 token', 'Daily tokens'), '', chart(drawn('trend', isIntro => trendSvg(width, trend, isIntro) ?? ''), label)) })
  }
  if (drawings.merges !== null) {
    const svg = drawn('merges', isIntro => mergesSvg(width, model.mergeDays, isIntro) ?? '')
    sections.push({ key: 'merges', html: section(t('每日合并', 'Daily merges'), note(mergedText(model)), chart(svg, `${t('每日合并', 'Daily merges')}, ${mergedText(model)}`)) })
  }
  if (scan !== null && firstDay !== null && used !== null) {
    const svg = drawn('clay', isIntro => usageHeatmapSvg(width, scan.days, firstDay, model.today, isIntro)).svg
    sections.push({ key: 'usage', html: section(t('Codex 使用', 'Codex usage'), note(used), chart(svg, t(`Codex 使用，${used}`, `Codex usage, ${used}`))) })
  }
  if (github !== null) {
    const svg = drawn('github', isIntro => githubHeatmapSvg(width, github.start, github.levels, model.today, isIntro)).svg
    const total = githubText(github.total)
    sections.push({ key: 'github', html: section(t('GitHub 贡献', 'GitHub contributions'), note(total), chart(svg, t(`GitHub 贡献，${total}`, `GitHub contributions, ${total}`))) })
  }

  return { model, sections }
}

const DESCRIPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['半截埋在土里，只露出一根芽尖，偷偷看你。', 'Half in the soil, with one tip out to watch you.'],
  ['整只钻出土，两片细叶子，小小一只。', 'All the way out, with two thin leaves. Still tiny.'],
  ['叶子变大变肥，个头也长了一圈。', 'Bigger, fatter leaves, and a size up.'],
  ['顶上鼓起一个粉色花苞，憋着要开。', 'A pink bud on top that can hardly wait to open.'],
  ['花开了，第一个大里程碑。', 'The flower opens: the first big milestone.'],
  ['花旁挂上小红果，长得越来越热闹。', 'Small red fruit beside the flower. It gets busy up there.'],
  ['头顶长成一棵树，来了只小蓝鸟定居。', 'A tree on its head, and a small blue bird moves in.'],
  ['满树樱花，花瓣一直往下飘。', 'A tree full of cherry blossom, with petals that keep falling.'],
  ['金叶子、头顶光环、全身发光，终极形态。', 'Golden leaves, a halo, a glow all over: the last form.'],
]

function etaText(days: number) {
  if (days < 60) return t(`约 ${days} 天后`, `in about ${days} days`)
  if (days < 365) return t(`约 ${Math.round(days / 30)} 个月后`, `in about ${Math.round(days / 30)} months`)

  return t(`约 ${(days / 365).toFixed(1)} 年后`, `in about ${(days / 365).toFixed(1)} years`)
}

/** Every form of the pet with the tokens it takes, and when the next ones come at the pace of the last 7 days. */
export function atlasHtml(model: Model) {
  const tokens = model.scan?.totals.tokens ?? 0
  const current = levelInfo(model.level).lv
  const from = addDays(model.today, -6)
  const daily = (model.scan?.days ?? []).filter(d => d.day >= from && d.day <= model.today).reduce((sum, d) => sum + d.tokens, 0) / 7
  const eta = (target: number) => (daily > 0 ? etaText(Math.max(1, Math.ceil((target - tokens) / daily))) : null)
  const isDay = model.local.hour >= 7 && model.local.hour < 19
  const cards = LEVELS.map((level, index) => {
    const next = LEVELS[index + 1]
    const status = level.lv < current ? 'unlocked' : level.lv === current ? 'current' : 'locked'
    const name = `Lv${level.lv} ${t(level.name, level.nameEn)}`
    const threshold = level.thresholdB > 0 ? t(`累计 ${level.thresholdB}B`, `${level.thresholdB}B in all`) : t('起点', 'Start')
    let state: string
    if (status === 'current') {
      const goal = next === undefined ? t(' · 已满级', ' · top level') : ` / ${formatTokens(next.thresholdB * 1e9)}`
      const progress = next === undefined ? 1 : Math.min(1, Math.max(0, (tokens - level.thresholdB * 1e9) / ((next.thresholdB - level.thresholdB) * 1e9)))
      const when = next === undefined ? null : eta(next.thresholdB * 1e9)
      state = `<span class="badge current">${esc(t('当前', 'Now'))} · ${formatTokens(tokens)}${esc(goal)}</span><progress value="${progress.toFixed(4)}" max="1"></progress>${when === null ? '' : `<p class="eta">${esc(t(`按最近 7 天的速度，${when}升级`, `At the pace of the last 7 days, the next level comes ${when}`))}</p>`}`
    } else {
      const text = status === 'unlocked' ? t('已解锁', 'Unlocked') : (eta(level.thresholdB * 1e9) ?? t('尚未解锁', 'Locked'))
      state = `<span class="badge ${status}">${esc(text)}</span>`
    }
    const description = DESCRIPTIONS[index]

    return `<article class="card ${status}"><div class="portrait" role="img" aria-label="${esc(name)}">${memoize(`portrait|${level.lv}|${isDay}`, () => portraitSvg(level.lv, isDay))}</div><div class="name"><h3>${esc(name)}</h3><span>${esc(threshold)}</span></div><p>${esc(description === undefined ? '' : t(description[0], description[1]))}</p>${state}</article>`
  })

  return `<div class="atlas-head"><h2>${esc(t('成长图鉴', 'Growth atlas'))}</h2>${button('atlas-close', '×', ` class="plain" aria-label="${esc(t('关闭图鉴', 'Close the atlas'))}"`)}</div><div class="atlas-grid">${cards.join('')}</div>`
}
