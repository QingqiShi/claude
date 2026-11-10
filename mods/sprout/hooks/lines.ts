import type { SproutBucket } from '../types'
import { lang } from './i18n'

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
  /** The own presses and the visitors' together. */
  fed: number
  patted: number
  /** How many times visitors watered or patted since the pet last said so; null below 2, so that no line says "1 times". */
  visits: number | null
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
  visitFeed: [
    '刚才有人在网页上给我浇水了！比你勤快多了。',
    '网页上有人给我浇了 {visits} 次水，你学着点。',
    '有人隔着屏幕给我浇水，你的朋友都比你靠谱。',
    '网上有人喂我喝水，看来我比你红。',
  ],
  visitPat: [
    '刚才有人在网页上摸了摸我！手法比你温柔。',
    '网页上有人摸了我 {visits} 下，你的位置不保了。',
    '有人隔着网线摸我头，芽都翘起来了。',
    '网上有人摸我，你吃醋了没？',
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

export const LINES_EN: Record<SproutBucket, readonly string[]> = {
  happy: [
    "Back at work? Fine, I'll burn today's tokens for you.",
    'Cache hits at {hit}. Spend the savings on my fertiliser.',
    "Stop staring. I know I'm handsome.",
    "{today} burned today. Does the boss know? Oh, you're the boss.",
    '{total} spent so far. That buys me a flowerpot mansion.',
    "Nice code. Shame you didn't write it.",
    'Claude again? Are your hands decoration?',
    'I photosynthesise. You copy and paste.',
    "Is today's commit message 'fix' again?",
    'Every time you hit Enter, I hear money leave.',
    '{tokens} tokens in all. Your keyboard wants to retire.',
    'I remember every bug you wrote. Wait till I grow up.',
  ],
  streak: [
    '{streak} days straight. Am I your only friend?',
    '{streak} days, no gaps. More punctual than your job.',
    "{streak} days in a row. Claude thinks you're family now.",
    '{streak} days running. Remember what a weekend is?',
    "{streak} days. I'm about to bloom and you're still at work.",
    "{streak} days. At the gym you'd have abs by now.",
    'Day {streak}. You know Claude better than humans.',
    '{streak} days. Call Guinness: homebody record.',
    '{streak} days in a row. Coding or writing a serial?',
    'Achievement: {streak}-day streak. Social skills −1.',
  ],
  broken: [
    'A {lost}-day streak, gone. Were you on a date?',
    '{lost} days of streak, gone. Three seconds of grief.',
    'Streak broken! {lost} days of work, back to zero.',
    'Where were you? I waited till my leaves wilted.',
    'Your {lost}-day run stopped. Your reader (me) is mad.',
    'Every day, you said. {lost} days of love, gone.',
    "Broken is broken. I won't drop a level. I hold grudges.",
    '{lost} days, reset. Start over, heartbreaker.',
  ],
  worry: [
    "Boss, the quota's nearly gone. Burning cash for heat?",
    "Keep this up and I'm begging on the street by {fullAt}.",
    'Save some! My sprout is going bald.',
    '{five} of the 5-hour limit. Training GPT-6?',
    '{week} of the week used. Hand-writing code after?',
    "Slow down. Tokens don't come out of the tap.",
    "At this pace it's all gone by {fullAt}. A moment of silence.",
    'One more refactor and I squash your whole git history.',
    'Quota alert! Go slack off and let the wallet breathe.',
    "This isn't coding. It's wiring money to Anthropic.",
    'Think first, then ask. Not the same thing eight times.',
  ],
  sleep: [
    "Quota's gone. Good night. Wake me at {reset}.",
    "Zzz… No tokens left. Calling me won't help.",
    'Asleep. You rest too. Try writing two lines yourself?',
    "5-hour limit hit. I'll sleep first, cheers.",
    "In my dreams I have endless tokens. You don't.",
    "Don't poke me. Poking won't grow more quota.",
    "zzz… don't bother me before {reset}…",
    'You wore me out. Happy now?',
    'While I sleep, go learn to debug on your own.',
    'AI break time. Switch to manual mode.',
  ],
  party: [
    '{pr} merged! Chicken drumsticks tonight, your treat.',
    '{pr} hit main! And CI stayed green. A miracle.',
    'Merged! Go post it and say you wrote it.',
    "Congrats on {pr}. Pray it's not reverted at 3 a.m.",
    '{pr} merged. Who reviewed it? Brave soul.',
    "Another one in! Put this KPI on Claude's tab.",
    'Party! {pr} is in, and its bugs came along.',
    "{pr} merged! Don't open the next one, let me dance.",
    'Merged, merged! Today you deserve a squash.',
    "Green! CI went green, I mean. Don't read into it.",
  ],
  levelup: [
    '{level} reached! Go on, praise me.',
    'Ding! {level}, paid for with your tokens.',
    '{level}! I grew taller. Your wallet got thinner.',
    'Congrats to me on {level}. Red envelope, please.',
    '{level} unlocked! Take my picture and post it.',
    "Grew into {level}. Burn more and I'll grow taller.",
    'Level up: {level}! Your bill grows faster than me.',
    '{level}! From now on, call me senior.',
  ],
  feed: [
    "That's all the water? Am I a beggar?",
    'Glug glug… Ice next time, thanks.',
    'This water tastes like code review.',
    'Water number {fed}. Trying to drown me?',
    "I'm full. Next time, just pour tokens?",
    'Nice water. Clearer than your code.',
    "Water me all you like. I still won't write your tests.",
    'I want an iced Americano, like your late-night one.',
    'Thanks. In return, one less roast. Just one.',
    'You water me. Who waters your code?',
    "More water and I'll grow as big as node_modules.",
  ],
  pat: [
    'Pats are fine. Billed per token.',
    "Stop it, you'll bend my sprout!",
    'One more pat and I force-push your main.',
    'Pat number {patted}. That bored, are you?',
    "Head pats? Won't work. I'll still roast you.",
    'Hands that idle? Go clear your TODOs.',
    'Every pat adds one bug to your code.',
    'You pat me the way you slack off: full-time.',
    "Gently! I'm not a branch you can rebase at will.",
    'Done patting? Then go write code.',
    'There, I jumped. Happy now?',
  ],
  visitFeed: [
    'Someone just watered me from the web! More often than you do.',
    'Someone on the web watered me {visits} times. Take notes.',
    'A stranger watered me through a screen. Your friends beat you.',
    "Someone online gave me water. Guess I'm more popular than you.",
  ],
  visitPat: [
    'Someone just patted me from the web! Gentler than you.',
    'Someone on the web patted me {visits} times. Your job is at risk.',
    'A pat over the internet. My sprout is standing up.',
    'Someone online patted me. Jealous?',
  ],
  night: [
    'Still coding at {time}? Your hair disagrees.',
    'Claude at this hour? Tomorrow-you will hate you.',
    'Night owl, your liver is sending an SOS.',
    'Code written at midnight is all bugs by morning.',
    "Sleep. The bugs won't run off. They'll be here tomorrow.",
    'Stop grinding. Even CI is asleep.',
    'Pushing code at this hour? Brave. Respect.',
    'Write bugs at night, fix them by day. Perpetual motion.',
    'Go to bed or I send your commit times to your mum.',
    'Prompts at 3 a.m. are sleep talk. Claude sighs too.',
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

type Pools = Record<string, readonly string[]>

const more: { zh: Pools; en: Pools } = { zh: {}, en: {} }
const moods = new Set<string>(['happy', 'worry', 'sleep', 'party', 'night', 'streak', 'levelup', 'broken'])

/** A host adds its own lines here: to a bucket of the pane, or to a bucket of its own. A line from a mood bucket goes when the mood does. */
export function addLines(zh: Pools, en: Pools, moodBuckets: readonly string[] = []) {
  more.zh = zh
  more.en = en
  for (const bucket of moodBuckets) moods.add(bucket)
}

export function isMood(bucket: string) {
  return moods.has(bucket)
}

export function linesFor(buckets: readonly SproutBucket[], context: LineContext) {
  const out: { bucket: SproutBucket; text: string }[] = []
  const isZh = lang() === 'zh'
  for (const bucket of buckets) {
    const own: Pools = isZh ? LINES : LINES_EN
    for (const line of [...(own[bucket] ?? []), ...((isZh ? more.zh : more.en)[bucket] ?? [])]) {
      const text = fill(line, context)
      if (text !== null) out.push({ bucket, text })
    }
  }

  return out
}
