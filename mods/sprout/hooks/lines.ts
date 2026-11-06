import type { SproutBucket } from '../types'

export type LineContext = {
  streak: number
  lost: number | null
  level: string
  total: string | null
  today: string | null
  hit: string | null
  tokens: string | null
  five: string | null
  week: string | null
  fullAt: string | null
  reset: string | null
  pr: string | null
  fed: number
  patted: number
  time: string
}

export const LINES: Record<SproutBucket, readonly string[]> = {
  happy: [
    '又来上班？行，今天的 token 我替你烧。',
    '缓存命中 {hit}，省下来的钱记得给我买肥料。',
    '别盯着我看，我知道我帅。',
    '今天已经烧了 {today}，老板知道吗？哦，你就是老板。',
    '累计花了 {total}，够给我买套花盆别墅了。',
    '代码写得不错，可惜不是你写的。',
    '又让 Claude 干活？你的手是装饰品吗？',
    '我在这儿光合作用，你在那儿复制粘贴。',
    '今天的 commit message 还是 fix 吗？',
    '你一敲回车，我就知道又要花钱了。',
    '累计 {tokens} token，你键盘都想退休了。',
    '你写的 bug 我都记着，等我长大一个个算账。',
  ],
  streak: [
    '连续 {streak} 天了，你是不是除了我没别的朋友？',
    '{streak} 天没断，打卡比上班还准时。',
    '连续 {streak} 天，Claude 都快认你当亲爹了。',
    '连续用了 {streak} 天，周末是啥你还记得吗？',
    '{streak} 天了，我都快开花了，你还没下班。',
    '坚持 {streak} 天，要是去健身早练出腹肌了。',
    '第 {streak} 天，你跟 Claude 比跟人类还熟。',
    '连续 {streak} 天，建议申请最宅吉尼斯纪录。',
    '{streak} 天连更，你是写代码还是写连载？',
    '解锁成就：连续 {streak} 天，社交能力 -1。',
  ],
  broken: [
    '连续 {lost} 天说断就断，你是去约会了吗？',
    '{lost} 天的连胜就这么没了，我替你心疼三秒。',
    '断签了！{lost} 天的努力，一夜回到解放前。',
    '你去哪了？我等到叶子都蔫了。',
    '{lost} 天连更断了，读者（我）很生气。',
    '说好的天天见呢？{lost} 天的情分说没就没。',
    '断了就断了，反正我不掉级。但我记仇。',
    '{lost} 天清零。重新开始吧，负心人。',
  ],
  worry: [
    '大哥，额度要见底了，你这是烧钱取暖？',
    '再这么造，{fullAt} 我就得出去要饭了。',
    '省着点！我头上的芽都快秃了。',
    '5 小时额度用了 {five}，你在训练 GPT-6 吗？',
    '本周已用 {week}，剩下几天你打算手写代码？',
    '慢点慢点，token 又不是自来水。',
    '照这速度，{fullAt} 就没得用了，提前默哀。',
    '再让它重构一遍，我就把你的 git 历史全 squash 了。',
    '额度告急！去摸会儿鱼，让钱包喘口气。',
    '你这不是写代码，是在给 Anthropic 打钱。',
    '先想清楚再问，别一句话问八遍。',
  ],
  sleep: [
    '额度用光了，晚安，{reset} 再叫我。',
    'Zzz……别叫了，没 token 了，叫也白叫。',
    '睡了。你也歇歇，自己手写两行试试？',
    '5 小时额度见底，我先睡为敬。',
    '梦里我有无限 token，现实里你没有。',
    '别戳我，戳我也长不出额度来。',
    'zzz……{reset} 之前别来烦我……',
    '你把我累睡着了，满意了？',
    '趁我睡着，你去学学怎么自己 debug。',
    '现在是 AI 休息时间，请切换到人工模式。',
  ],
  party: [
    '{pr} 合了！今晚加鸡腿，你请。',
    '{pr} 进 main 了！CI 居然没红，奇迹。',
    '合并成功！快发朋友圈，就说是你写的。',
    '恭喜 {pr} 上线，祈祷别半夜回滚。',
    '{pr} 合了，谁 review 的？胆子真大。',
    '又合一个！这份 KPI 记 Claude 头上。',
    '蹦迪！{pr} 合进去了，bug 也一起进去了。',
    '{pr} 合了！先别开下一个，让我跳会儿。',
    '合了合了！今天的你配得上一个 squash。',
    '绿了！我是说 CI 绿了，你别多想。',
  ],
  levelup: [
    '升到 {level}了！还不快夸我？',
    '叮！{level}达成，全是你烧的 token 换的。',
    '{level}！我长个儿了，你的钱包瘦了。',
    '恭喜我升到 {level}，红包拿来。',
    '{level}解锁！快给我拍张照发朋友圈。',
    '长成 {level}了，再烧点 token 我还能更高。',
    '升级 {level}！你的账单长得比我还快。',
    '{level}了！以后见我要叫一声前辈。',
  ],
  feed: [
    '就这点水？打发叫花子呢？',
    '咕嘟咕嘟……下次加冰，谢谢。',
    '这水有股 code review 的味道。',
    '第 {fed} 次喂水了，你是想把我淹死？',
    '喝饱了，下次直接浇 token 行吗？',
    '水不错，比你的代码清澈多了。',
    '浇水可以，别指望我替你写测试。',
    '我要冰美式，跟你熬夜那杯一样的。',
    '谢了，作为回报我少嘴你一句。就一句。',
    '你给我浇水，谁给你的代码浇浇水？',
    '再浇我就长得跟 node_modules 一样大了。',
  ],
  pat: [
    '摸可以，按 token 收费。',
    '别摸了，芽要歪了！',
    '再摸我就去 force push 你的 main。',
    '第 {patted} 次了，你是不是闲得发慌？',
    '摸头杀？没用，该嘴还是嘴。',
    '手这么闲，不如去把 TODO 清一清。',
    '摸一次，你的代码就多一个 bug。',
    '你摸我的样子，像极了你摸鱼的样子。',
    '轻点！我不是你那能随便 rebase 的分支。',
    '摸够了吗？摸够了去写代码。',
    '跳一下给你看，满意了吧？',
  ],
  night: [
    '凌晨 {time} 还在写？你的头发不同意。',
    '这个点还开着 Claude，明天的你会恨你。',
    '夜猫子，你的肝在给你发 SOS。',
    '半夜写的代码，明早看全是 bug。',
    '睡吧，bug 又不会跑，明天它们还在。',
    '别卷了，连 CI 都睡了。',
    '这个点 push 代码？勇士，佩服。',
    '熬夜写 bug，白天修 bug，你这是永动机。',
    '再不睡，我把你的 commit 时间发给你妈。',
    '凌晨的 prompt 全是梦话，Claude 也很无奈。',
  ],
}

const PLACEHOLDER = /\{(\w+)\}/g

export function fill(line: string, context: LineContext): string | null {
  let isMissing = false
  const text = line.replace(PLACEHOLDER, (_, name: string) => {
    const value = (context as Record<string, unknown>)[name]
    if (value === null || value === undefined) {
      isMissing = true
      return ''
    }

    return String(value)
  })

  return isMissing ? null : text
}

export function linesFor(buckets: readonly SproutBucket[], context: LineContext) {
  const out: { bucket: SproutBucket; text: string }[] = []
  for (const bucket of buckets) {
    for (const line of LINES[bucket]) {
      const text = fill(line, context)
      if (text !== null) out.push({ bucket, text })
    }
  }

  return out
}
