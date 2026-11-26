import type { Language } from './i18n'

export type Appearance = 'system' | 'light' | 'dark'
export type Accent = 'system' | 'blue' | 'teal' | 'rose' | 'amber'
export interface Preferences { language: Language; appearance: Appearance; accent: Accent }
export const defaults: Preferences = { language: 'en', appearance: 'system', accent: 'system' }
export const preferencesKey = 'marpora.preferences.v1'

export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey) || 'null')
    return {
      language: saved?.language === 'zh' ? 'zh' : 'en',
      appearance: ['system', 'light', 'dark'].includes(saved?.appearance) ? saved.appearance : 'system',
      accent: ['system', 'blue', 'teal', 'rose', 'amber'].includes(saved?.accent) ? saved.accent : 'system',
    }
  } catch { return { ...defaults } }
}

export function resolveAppearance(appearance: Appearance, systemDark: boolean): 'light' | 'dark' {
  return appearance === 'system' ? systemDark ? 'dark' : 'light' : appearance
}
