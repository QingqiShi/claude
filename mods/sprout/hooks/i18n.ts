// Both hosts can use the language helpers without importing a UI runtime.
type LanguageHost = {
  settings: { read(input: { key: 'language' }): Promise<unknown> }
  env: { get(key: string): Promise<string | null | undefined> }
}

export type Lang = 'zh' | 'en'

const CHINESE = /^zh(?![a-z])|chinese|中文|汉语|漢語|华语|華語|普通话|國語|国语|粤语|粵語|简体|簡體|繁体|繁體/i

let current: Lang = 'en'

export function langOf(setting: unknown, locale: string | undefined): Lang {
  if (typeof setting === 'string' && setting.trim() !== '') return CHINESE.test(setting.trim()) ? 'zh' : 'en'

  return locale !== undefined && /^zh(?![a-z])/i.test(locale) ? 'zh' : 'en'
}

export async function loadLang($: LanguageHost) {
  let setting: unknown
  try {
    setting = await $.settings.read({ key: 'language' })
  } catch {}
  let locale: string | undefined
  if (typeof setting !== 'string' || setting.trim() === '') {
    try {
      locale = (await $.env.get('LC_ALL')) || (await $.env.get('LANG')) || undefined
    } catch {}
  }
  current = langOf(setting, locale)

  return current
}

export function lang() {
  return current
}

export function setLang(next: Lang) {
  current = next
}

export function t(zh: string, en: string) {
  return current === 'zh' ? zh : en
}
