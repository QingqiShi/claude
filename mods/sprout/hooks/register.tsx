import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SproutBuddy } from '../types'
import { recordLimits, startSprout } from './data'
import { agoText, formatTokens, formatUsd, withCommas } from './logic'
import { loadLang, t } from './i18n'
import { levelLabel } from './levels'
import {
  STALE_QUOTA_MS,
  contentWidth,
  forecastText,
  githubText,
  hydrateRange,
  introsFor,
  mergedText,
  press,
  rangeText,
  readModel,
  resetText,
  sceneFor,
  setRange,
  talk,
  tilesInputFor,
  title,
  trendDays,
  trendText,
  usedText,
} from './model'
import { capsuleSvg, githubHeatmapSvg, githubLevels, levelOf, mergesSvg, tilesSvg, trendSvg, usageHeatmapSvg, usageLevels } from './panels'
import type { Scheme } from './raster'
import { memoize } from './svg-kit'
import { buddyServer, cancelConnect, disconnectBuddy, hideOffer, reconnectBuddy, setBuddyServer, startConnect, syncBuddy } from './sync'
import type { TerminalSync, TerminalView } from './terminal'
import { terminalPane } from './terminal'

// The engine reads state keys off each file's own source, so this atom is written here and again in model.ts and sync.ts.
const buddyState = atom(
  { plugin: 'sprout', key: 'buddy' } as const,
  { isReady: null, link: null, connect: null, upload: null, error: null, note: null, isOfferHidden: false },
  { shape: 'buddy-1' },
)

const PANE = 'sprout'

/** The terminal tells no plugin its colors, so we take the scheme from the theme the person chose. */
async function schemeOf($: EngineInterface): Promise<Scheme> {
  try {
    const theme = (await $.config.list()).find(row => row.key === 'theme')?.value

    return typeof theme === 'string' && theme.includes('light') ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** One quiet line on syncing to the phone: the offer, the connect in progress, or the link and its last upload. */
function syncView($: EngineInterface, buddy: SproutBuddy, now: number): TerminalSync | null {
  if (buddy.isReady !== true) return null
  const connect = buddy.connect
  if (connect !== null) {
    return {
      text: t(`在浏览器里确认连接 · 代码 ${connect.code}`, `Confirm in your browser · code ${connect.code}`),
      link: { href: connect.url, label: t('打开页面', 'Open page') },
      buttons: [{ key: 'buddy-cancel', label: t('取消', 'Cancel'), isPrimary: false, onPress: () => void cancelConnect($).catch(() => {}) }],
    }
  }
  const link = buddy.link
  if (link !== null) {
    const text =
      buddy.error === 'unauthorized'
        ? t('Buddy 不认这台 Mac 了', 'Buddy no longer knows this Mac')
        : buddy.error === 'network'
          ? t('暂时连不上 Buddy，稍后再同步', "Can't reach Buddy. Will sync later")
          : buddy.upload === null
            ? t('已连接，等第一次同步', 'Connected, waiting for the first sync')
            : t(`已同步到手机 · ${agoText(buddy.upload.at, now)}`, `Synced to phone · ${agoText(buddy.upload.at, now)}`)
    return {
      text,
      link: { href: `${link.server}/u/${link.user}`, label: t('我的页面', 'My page') },
      buttons:
        buddy.error === 'unauthorized'
          ? [
              { key: 'buddy-again', label: t('重新连接', 'Reconnect'), isPrimary: true, onPress: () => void reconnectBuddy($).catch(() => {}) },
              { key: 'buddy-off', label: t('断开', 'Disconnect'), isPrimary: false, onPress: () => void disconnectBuddy($).catch(() => {}) },
            ]
          : [{ key: 'buddy-off', label: t('断开', 'Disconnect'), isPrimary: false, onPress: () => void disconnectBuddy($).catch(() => {}) }],
    }
  }
  if (buddy.isOfferHidden && buddy.note === null) return null

  return {
    text: buddy.note ?? t('手机上也想看小苗？', 'See Miao on your phone too?'),
    link: null,
    buttons: [
      { key: 'buddy-sync', label: t('同步到手机', 'Sync to phone'), isPrimary: true, onPress: () => void startConnect($).catch(() => {}) },
      { key: 'buddy-no', label: t('不用', 'No thanks'), isPrimary: false, onPress: () => void hideOffer($, true).catch(() => {}) },
    ],
  }
}

async function runSproutCommand($: EngineInterface, args: string) {
  await loadLang($)
  const [verb = '', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const buddy = await read($, buddyState)
  switch (verb) {
    case '': {
      await $.ui.open({ id: PANE, title: title() })
      return t('小苗来了。', 'Miao is here.')
    }
    case 'sync': {
      if (buddy.isReady !== true) return t('这台电脑上同步不了：需要 macOS 的钥匙串和 node。', "Can't sync on this computer: it needs the macOS Keychain and node.")
      if (buddy.link !== null) {
        await syncBuddy($, true)
        const after = await read($, buddyState)
        return after.error === null
          ? t('已同步到手机。', 'Synced to phone.')
          : after.error === 'unauthorized'
            ? t('Buddy 不认这台 Mac 了，在面板里点「重新连接」。', 'Buddy no longer knows this Mac. Press Reconnect in the pane.')
            : t('暂时连不上 Buddy。', "Can't reach Buddy right now.")
      }
      await hideOffer($, false)
      await startConnect($)
      const after = await read($, buddyState)
      return after.connect === null
        ? (after.note ?? t('暂时连不上 Buddy。', "Can't reach Buddy right now."))
        : t(`在浏览器里确认连接，代码 ${after.connect.code}：${after.connect.url}`, `Confirm in your browser, code ${after.connect.code}: ${after.connect.url}`)
    }
    case 'server': {
      const value = rest[0]
      if (value === undefined) return t(`Buddy 服务器：${await buddyServer($)}`, `Buddy server: ${await buddyServer($)}`)
      const server = await setBuddyServer($, value === 'default' ? null : value)
      return server === null ? t('要一个 http(s) 地址，或 default。', 'Give an http(s) address, or default.') : t(`Buddy 服务器：${server}`, `Buddy server: ${server}`)
    }
    case 'disconnect': {
      await disconnectBuddy($)
      return t(
        '已断开。钥匙留在这台 Mac 上，再连还是同一台。要连同它的数据一起去掉，在 Buddy 的「我的 Mac」里移除。',
        'Disconnected. The key stays on this Mac, so a new connect makes it the same Mac. To remove it and its data too, remove it under Your Macs on Buddy.',
      )
    }
    default:
      return t('用法：/sprout、/sprout sync、/sprout server <地址|default>、/sprout disconnect', 'Usage: /sprout, /sprout sync, /sprout server <url|default>, /sprout disconnect')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    try {
      await $.command.register({
        name: 'sprout',
        description: t('打开小苗面板；sync 同步到手机', 'Open the Miao pane; sync sends it to your phone'),
        argumentHint: '[sync | server <url> | disconnect]',
      })
    } catch {}
    void $.ui.open({ id: PANE, title: title() }).catch(() => {})
    void hydrateRange($)
    const started = await next(e)
    startSprout($, e.cwd)

    return started
  })

  on('command.run', { command: 'sprout' }, async ($, e) => ({ text: await runSproutCommand($, e.args) }))

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length > 0) void recordLimits($, e.rateLimits).catch(() => {})

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const model = await readModel($)
    const trend = trendDays(model)
    const used = usedText(model)

    if (e.surface === 'terminal') {
      const tiles = tilesInputFor(model, 0)
      const scan = model.scan
      const firstDay = scan?.firstDay ?? null
      const view: TerminalView = {
        width: e.props.bodyColumns,
        scheme: await schemeOf($),
        title: title(),
        repo: model.env.repo ?? '',
        pet: {
          mood: model.mood,
          action: model.action,
          isConfetti: (model.party !== null || model.isLevelUp) && model.mood === 'party',
          level: model.level,
          pips: model.pips,
          isDay: model.local.hour >= 7 && model.local.hour < 19,
          text: model.text,
        },
        quota: {
          windows: model.windows.map(w => ({
            label: w.label,
            quotaLabel: w.quotaLabel,
            pct: w.limit.pct,
            projected: w.forecast?.projected ?? null,
            reset: resetText(w, model.now, model.tz),
            sentence: forecastText(w, model.now, model.tz),
          })),
          note: model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS ? t(`更新于 ${agoText(model.quota.at, model.now)}`, `Updated ${agoText(model.quota.at, model.now)}`) : null,
        },
        stats:
          tiles === null || firstDay === null
            ? null
            : {
                heading: rangeText(model),
                range: model.range,
                tiles: {
                  tokensLabel: tiles.tokensLabel,
                  tokens: tiles.tokens,
                  costUsd: formatUsd(tiles.costUsd),
                  todayUsd: tiles.todayUsd > 0 ? formatUsd(tiles.todayUsd) : null,
                  streak: tiles.streak,
                  week: tiles.week,
                  cacheHitRate: tiles.cacheHitRate,
                  bars: tiles.bars,
                },
              },
        trend,
        merges: model.merged.prs === 0 ? null : { days: model.mergeDays, heading: mergedText(model) },
        usage: scan === null || firstDay === null || used === null ? null : { levelOn: usageLevels(scan.days, firstDay), heading: used },
        github: model.github === null ? null : { levelOn: githubLevels(model.github.start, model.github.levels), heading: githubText(model.github.total) },
        today: model.today,
        rows: e.props.placement === 'dock' ? e.props.scroll.bodyRows : null,
        sync: syncView($, model.buddy, model.now),
        on: {
          feed: () => void press($, 'feed'),
          pat: () => void press($, 'pat'),
          sass: () => void talk($, model.moodKey),
          range: range => void setRange($, range),
        },
      }

      return terminalPane($.ui.resolve(e), view)
    }

    const { Box, Text, Button, Svg, Link } = $.ui.resolve(e)
    const width = contentWidth(e.props.bodyColumns)
    const sync = syncView($, model.buddy, model.now)
    const scan = model.scan
    const isStale = model.quota.at !== null && model.now - model.quota.at > STALE_QUOTA_MS
    const sectionHead = (left: string, right: JSX.Element | null) => (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="sm">
        <Text dimColor>{left}</Text>
        {right}
      </Box>
    )

    const firstDay = scan?.firstDay ?? null
    const github = model.github
    const tilesInput = tilesInputFor(model, width)
    const drawings = {
      tiles: tilesInput === null ? null : `tiles|${JSON.stringify(tilesInput)}`,
      trend: trend.length < 2 ? null : `trend|${width}|${trend.map(d => d.tokens).join(',')}`,
      merges: model.merged.prs === 0 ? null : `merges|${width}|${model.mergeDays.map(d => `${d.prs}:${d.additions}:${d.deletions}`).join(',')}`,
      clay: scan === null || firstDay === null ? null : `clay|${width}|${model.today}|${firstDay}|${scan.days.map(d => `${d.day}:${d.tokens}`).join(',')}`,
      github: github === null ? null : `gh|${width}|${model.today}|${github.start}|${github.levels}`,
    }
    const intro = await introsFor($, model.today, drawings)
    const tiles =
      tilesInput === null
        ? null
        : memoize(`${drawings.tiles}|${intro.has('tiles')}`, () => tilesSvg({ ...tilesInput, isIntro: intro.has('tiles') }))
    const trendSource =
      drawings.trend === null ? null : memoize(`${drawings.trend}|${intro.has('trend')}`, () => trendSvg(width, trend, intro.has('trend')) ?? '')
    const mergesSource =
      drawings.merges === null
        ? null
        : memoize(`${drawings.merges}|${intro.has('merges')}`, () => mergesSvg(width, model.mergeDays, intro.has('merges')) ?? '')
    const clayDrawing =
      scan === null || firstDay === null
        ? null
        : memoize(`${drawings.clay}|${intro.has('clay')}`, () => usageHeatmapSvg(width, scan.days, firstDay, model.today, intro.has('clay')))
    const ghDrawing =
      github === null
        ? null
        : memoize(`${drawings.github}|${intro.has('github')}`, () =>
            githubHeatmapSvg(width, github.start, github.levels, model.today, intro.has('github')),
          )

    return (
      <Box flexDirection="column" gap="lg">
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Text color="#3F8F4A">●</Text>
          <Text weight="medium">{title()}</Text>
          <Box flexGrow={1} />
          <Text dimColor wrap="truncate-end">
            {model.env.repo ?? ''}
          </Text>
        </Box>

        <Box flexDirection="column" gap="sm">
          <Svg source={sceneFor(model, width)} alt={t(`小苗，${levelLabel(model.level)}：${model.text}`, `Miao, ${levelLabel(model.level)}: ${model.text}`)} />
          <Box flexDirection="row" flexWrap="nowrap" gap="sm">
            <Button key="feed" label={t('喂水', 'Water')} onPress={() => void press($, 'feed')} />
            <Button key="pat" label={t('摸摸', 'Pat')} onPress={() => void press($, 'pat')} />
            <Button key="sass" label={t('再嘴一句', 'Roast me')} onPress={() => void talk($, model.moodKey)} />
          </Box>
        </Box>

        <Box flexDirection="column" gap="sm">
          {sectionHead(
            t('额度', 'Quota'),
            isStale && model.quota.at !== null ? <Text dimColor>{t(`更新于 ${agoText(model.quota.at, model.now)}`, `Updated ${agoText(model.quota.at, model.now)}`)}</Text> : null,
          )}
          {model.windows.length === 0 ? (
            <Text dimColor>{t('还没有额度读数。用订阅账号发一句话，我就看得到了。', 'No quota reading yet. Send one message on a subscription account and I will see it.')}</Text>
          ) : (
            model.windows.map(w => {
              const projected = w.forecast === null ? null : w.forecast.projected
              const sentence = forecastText(w, model.now, model.tz)
              const isOver = levelOf(w.limit.pct, projected) === 'over'
              const source = memoize(`cap|${width}|${w.limit.pct}|${projected === null ? -1 : Math.round(projected)}`, () =>
                capsuleSvg(width, w.limit.pct, projected === null ? null : Math.round(projected)),
              )
              return (
                <Box flexDirection="column" gap="xs">
                  <Box flexDirection="row" justifyContent="space-between" gap="sm">
                    <Text dimColor>{w.label}</Text>
                    <Text dimColor>{resetText(w, model.now, model.tz)}</Text>
                  </Box>
                  <Svg source={source} alt={t(`${w.label}已用 ${Math.round(w.limit.pct)}%`, `${w.label}: ${Math.round(w.limit.pct)}% used`)} />
                  {sentence === null ? null : isOver ? <Text color="error">{sentence}</Text> : <Text dimColor>{sentence}</Text>}
                </Box>
              )
            })
          )}
        </Box>

        {scan === null || firstDay === null || tiles === null || tilesInput === null ? (
          <Text dimColor>{t('正在翻你的聊天记录，第一次要一两分钟。', 'Reading your chat history. The first time takes a minute or two.')}</Text>
        ) : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(
              rangeText(model),
              <Box flexDirection="row" gap="xs" flexWrap="nowrap">
                <Button key="range-30" label={t('30 天', '30 days')} plain dimColor={model.range !== '30'} onPress={() => void setRange($, '30')} />
                <Button key="range-all" label={t('全部', 'All')} plain dimColor={model.range !== 'all'} onPress={() => void setRange($, 'all')} />
              </Box>,
            )}
            <Svg
              source={tiles}
              alt={t(
                `${rangeText(model)}：${formatTokens(tilesInput.tokens)} token，按 API 价格估算 ${formatUsd(tilesInput.costUsd)}，今天 ${formatUsd(tilesInput.todayUsd)}；连续使用 ${model.streak} 天；缓存命中 ${(tilesInput.cacheHitRate * 100).toFixed(1)}%`,
                `${rangeText(model)}: ${formatTokens(tilesInput.tokens)} tokens, ${formatUsd(tilesInput.costUsd)} at API prices, ${formatUsd(tilesInput.todayUsd)} today; ${model.streak}-day streak; ${(tilesInput.cacheHitRate * 100).toFixed(1)}% cache hits`,
              )}
            />
          </Box>
        )}

        {trendSource === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(t('每日 token', 'Daily tokens'), null)}
            <Svg source={trendSource} alt={t(`每日 token，最近 ${trend.length} 天，${trendText(trend)}`, `Daily tokens, last ${trend.length} days, ${trendText(trend)}`)} />
          </Box>
        )}

        {mergesSource === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(
              t('每日合并', 'Daily merges'),
              <Text dimColor wrap="truncate-end">
                {mergedText(model)}
              </Text>,
            )}
            <Svg
              source={mergesSource}
              alt={t(
                `最近 ${model.mergeDays.length} 天合并 ${model.merged.prs} 个 PR，共改动 ${withCommas(model.merged.additions + model.merged.deletions)} 行：新增 ${withCommas(model.merged.additions)} 行，删除 ${withCommas(model.merged.deletions)} 行`,
                `${model.merged.prs} PRs merged in the last ${model.mergeDays.length} days, ${withCommas(model.merged.additions + model.merged.deletions)} lines changed: ${withCommas(model.merged.additions)} added, ${withCommas(model.merged.deletions)} removed`,
              )}
            />
          </Box>
        )}

        {clayDrawing === null || used === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(t('Claude 使用', 'Claude usage'), <Text dimColor>{used}</Text>)}
            <Svg source={clayDrawing.svg} alt={t(`Claude 使用，${used}`, `Claude usage, ${used}`)} />
          </Box>
        )}

        {ghDrawing === null || github === null ? null : (
          <Box flexDirection="column" gap="sm">
            {sectionHead(t('GitHub 贡献', 'GitHub contributions'), <Text dimColor>{githubText(github.total)}</Text>)}
            <Svg source={ghDrawing.svg} alt={t(`GitHub 贡献，${githubText(github.total)}`, `GitHub contributions, ${githubText(github.total)}`)} />
          </Box>
        )}

        {sync === null ? null : (
          <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
            <Text dimColor>{sync.text}</Text>
            {sync.link === null ? null : <Link href={sync.link.href} label={sync.link.label} />}
            {sync.buttons.map(button =>
              button.isPrimary ? (
                <Button key={button.key} label={button.label} onPress={button.onPress} />
              ) : (
                <Button key={button.key} label={button.label} plain dimColor onPress={button.onPress} />
              ),
            )}
          </Box>
        )}
      </Box>
    )
  }).catch(($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>{t('小苗打了个盹，过会儿再来。', 'Miao is taking a nap. Come back soon.')}</Text>
  })
}
