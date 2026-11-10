import { addLines } from '../hooks/lines'

// Tibo and CatGPT are jokes. No line says that a person reset the quota.
const ZH = {
  pray: ['Tibo，雨呢？我他妈快成茶叶了。', '代码明天再写，Tibo 今天能不能下雨？', '求雨中。别催，我又没长 reset 键。', '你拜我没用，Tibo 才管那根水管。'],
  reset: ['活了。刚才说收工的不算。', '额度回来了，朕还能再绿一会儿。', '下雨了！这次省着点烧，听见没？', '是 Tibo 显灵，还是闹钟到点了？'],
  cat: ['Cat 换厂，我换盆，就你还没下班。', 'CatGPT 来了。我的花盆不设猫砂区。', '她换了工牌，我换了花盆。都挺忙。', 'Cat 管产品，我管嘴臭。分工明确。'],
  overwater: [
    '再浇就养王八吧，我不干了。', '停！我他妈是植物，不是海绵。', '伞都撑开了，你还没看懂？', '再浇就改养水稻，听懂了吗？',
    '你在浇花，还是给花盆做压力测试？', '水位比你需求涨得还快。', '盆底漏了。恭喜，交付一处水景。', '叶子没长，游泳倒是快学会了。',
    '我申请的是肥料，不是洪水预算。', 'Tibo 没下雨，你他妈先开闸了。', '给 Codex 浇去，看看能不能长点脑子。', '再倒一壶，我就得申请船牌了。',
  ],
  overpat: [
    '手这么闲，去抽 Codex，别薅我。', '别盘了，我不是核桃。', '芽都薅歪了，你还挺有成就感？', '不出来了。你跟 Codex 一个德行，没完没了。',
    '摸头是安慰，搓秃算工伤。', '这片叶子还没交付，你先给盘包浆了。', '轻点，你又不是来验西瓜的。', '再摸收费。花盆旁边放个收款码。',
    '手停一下，我得数数还剩几片叶子。', '你那鼠标是焊在摸摸上了吗？', 'Codex 犯的错，凭啥拿我的头出气？', '叶子已经同意了，别再点确认了。',
  ],
  return: ['回来了？水壶还在老地方，自己拿。', '失踪这么久，我以为你改用纸笔了。', '别解释，先浇水。我憋了好几天没骂人。'],
  busy: ['它还在想，我已经光合作用一轮了。', '这破活儿还没完？我茶都泡开了。', '你在烧钱，它在烧智商，我在旁边烤火。', '别催它。我倒要看看能磨叽到几点。'],
  planning: ['又他妈开始列计划了，它准备考公啊？', '计划都写三页了，代码呢？', '它在写计划，我先长个芽。谁快还真不好说。'],
  compact: ['它失忆了。我还记得它刚才怎么犯贱。', '上下文压缩了，你欠的肥料可没清零。', '给下一任 Codex 留张纸条：别再犯蠢。', '刚认识，刚熟悉，又他妈从头来过。'],
  agents: ['你开了 {agents} 个 agent，是要开外包公司？', '分身倒是不少，谁负责收拾烂摊子？', '几个脑子一起转，最好别一起犯蠢。'],
  test_failed: ['问题不大，它说的。', '又红了。先把庆功酒换成灭火器。', '修一个生三个，这傻逼还挺会繁殖。'],
  test_passed: ['绿了。先别碰它，让我欣赏十秒。', '终于过了，我他妈都快憋出花了。', '这轮算它赢。刚才骂它的话不撤回。'],
  done: ['它说搞定了。我先把灭火器拿出来。', '收工？先看看这傻逼留没留作业。', '行了，今天先这样。明天接着骂它。'],
  interrupted: ['叫停得好，再跑下去我都想拔网线。', '你一句不是这样，它又得重来。', '刹车踩得及时，花盆保住了。'],
  approval: ['你都说三遍了，它还问确认。确认你妈。', '又问？这傻逼是复读机成精了？', '先干活，再写申请报告，行不行？'],
  happy: ['再来一次？你俩是真他妈不信邪。', '让它改个按钮，别让这傻逼把祖坟都重构了。', '我骂你可以，它凭什么让你受这气？'],
  night: ['这轮跑完就睡。我替你看着这傻逼。'],
  pat: ['你摸的是我，不是 Tibo 的 reset 按钮。'],
}
const EN: Record<keyof typeof ZH, readonly string[]> = {
  pray: ['Tibo, where is the rain? I am turning into bloody tea.', 'Code can wait. Can Tibo make it rain today?', 'Praying for rain. I do not grow reset buttons.', 'Wrong plant. Tibo owns that water pipe.'],
  reset: ['Alive again. Ignore what I said about clocking off.', 'Quota is back. I can stay green a little longer.', 'Rain! Try not to burn it all this time.', 'Saint Tibo, or just the reset clock?'],
  cat: ['Cat changed jobs. I changed pots. You are still working.', 'CatGPT is here. This pot is not a litter box.', 'She got a new badge. I got a new pot. Busy week.', 'Cat handles products. I handle trash talk.'],
  overwater: [
    'One more pour and you can raise a turtle instead.', 'Stop. I am a plant, not a bloody sponge.', 'I have an umbrella. Take the hint.', 'Keep going and we are growing rice.',
    'Watering a plant or stress-testing a pot?', 'Water rises faster than your scope.', 'Pot leaks. Congrats on the water feature.', 'No new leaves. Learning to swim, though.',
    'I asked for fertiliser, not a flood budget.', 'No rain from Tibo. You opened the dam.', 'Water Codex. Maybe it will grow a brain.', 'One more jug and I need a boat licence.',
  ],
  overpat: [
    'Hands that idle? Go slap Codex, not my leaves.', 'Stop polishing me. I am not a walnut.', 'You bent my sprout. Proud of yourself?', 'Staying underground. You and Codex never quit.',
    'Comfort me. Do not polish me bald.', 'This leaf has not shipped. You wore it out.', 'Easy. I am not a melon to inspect.', 'Next pat costs money. Cash by the pot.',
    'Hands off. Let me count my leaves.', 'Is your mouse welded to the Pat button?', 'Codex messed up. Why punish my head?', 'Leaves approved. Stop confirming.',
  ],
  return: ['Back? Watering can is where you left it.', 'Gone so long I thought you switched to pencil.', 'Water first. I have days of insults saved up.'],
  busy: ['Still thinking? I finished a whole photosynthesis cycle.', 'Still on this job? My tea is ready.', 'You burn money. It burns brain cells. I enjoy the heat.', 'Let it cook. I want to see how long this takes.'],
  planning: ['Another bloody plan. Is it running for office?', 'Three pages of plans. Where is the code?', 'It plans, I sprout. Place your bets.'],
  compact: ['It forgot. I remember exactly how it screwed up.', 'Context compressed. Your fertiliser debt survives.', 'Note for the next Codex: stop being an idiot.', 'We just met, got acquainted, and start over. Again.'],
  agents: ['{agents} agents? Starting an outsourcing firm?', 'Plenty of clones. Who cleans up the mess?', 'Several brains. Please do not all screw up together.'],
  test_failed: ['No big deal. Its words.', 'Red again. Swap the champagne for a fire extinguisher.', 'Fix one, breed three. This idiot is farming bugs.'],
  test_passed: ['Green. Hands off. Let me admire it for ten seconds.', 'Finally passed. I nearly bloomed holding my breath.', 'It wins this round. I retract none of the insults.'],
  done: ['It says done. I am getting the fire extinguisher.', 'Done? Check what homework that idiot left behind.', 'Clock off. We can curse it again tomorrow.'],
  interrupted: ['Good stop. I was about to pull the cable.', 'One "not like that" and it starts over.', 'Nice brakes. The flowerpot survives.'],
  approval: ['You said it three times. What more confirmation, damn it?', 'Asking again? Is this idiot a broken record?', 'Do the job. File the paperwork after.'],
  happy: ['Try again? You two really do not learn, damn it.', 'One button. Do not let that idiot refactor the ancestors.', 'I get to roast you. It does not get to waste your day.'],
  night: ['Finish this round, then sleep. I will watch that idiot.'],
  pat: ['You are patting me, not Tibo’s reset button.'],
}

export type CodexBucket = keyof typeof ZH

/** The buckets that follow what Codex does. A line from one of them goes when the event does. */
export const EVENT_BUCKETS = ['reset', 'return', 'busy', 'planning', 'compact', 'agents', 'test_failed', 'test_passed', 'done', 'interrupted', 'approval'] as const satisfies readonly CodexBucket[]

export function addCodexLines() {
  addLines(ZH, EN, EVENT_BUCKETS)
}

/** The lines of the mod talk about Claude. */
export function say(text: string) {
  return text.replaceAll('Claude', 'Codex').replaceAll('Anthropic', 'OpenAI').replace('5 小时额度见底', '额度见底').replace('5-hour limit hit', 'Quota limit hit')
}

