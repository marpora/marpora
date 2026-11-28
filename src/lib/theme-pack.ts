import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { version as appVersion } from '../../package.json'
import { isMap, isScalar, parseDocument } from 'yaml'
export type ThemeCategory = 'showcase' | 'teaching' | 'academic' | 'business' | 'custom'
export interface ThemeManifest {
  schemaVersion: 1; id: string; version: string; name: { en: string; zh: string }; category: ThemeCategory
  description: { en: string; zh: string }; author: string; license: string; theme: string; layouts: string[]; minAppVersion: string
}
export interface ThemePack extends ThemeManifest { css: string; starter: string }
const categories = ['showcase', 'teaching', 'academic', 'business', 'custom']
export const reservedThemes = new Set(['default', 'gaia', 'uncover', 'uic-cs', 'marpora-orbit', 'marpora-chalk', 'marpora-thesis', 'marpora-brief'])
export function themeName(css: string): string | null { return css.match(/\/\*[\s\S]*?@theme\s+([a-zA-Z0-9_-]+)(?=\s|\*\/)[\s\S]*?\*\//)?.[1] || null }
const fail = (): never => { throw new Error('MAR_PORA:invalidThemePack') }
export function validatePack(value: unknown): ThemePack {
  if (!value || typeof value !== 'object') return fail()
  const v = value as Record<string, unknown>
  const string = (key: string, max: number) => typeof v[key] === 'string' && (v[key] as string).length > 0 && (v[key] as string).length <= max
  const localized = (value: unknown) => !!value && typeof value === 'object' && ['en', 'zh'].every(key => typeof (value as Record<string, unknown>)[key] === 'string' && ((value as Record<string, string>)[key].length <= 400))
  if (v.schemaVersion !== 1 || !string('id', 130) || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(v.id as string) || !string('version', 40) || !/^\d+\.\d+\.\d+$/.test(v.version as string) || !localized(v.name) || !localized(v.description) || !categories.includes(String(v.category)) || !string('author', 120) || !string('license', 120) || !string('theme', 80) || !/^[a-zA-Z0-9_-]+$/.test(v.theme as string) || !string('css', 1024 * 1024) || !string('starter', 256 * 1024) || !Array.isArray(v.layouts) || v.layouts.length > 30 || !v.layouts.every(layout => typeof layout === 'string' && /^[a-z0-9_-]{1,40}$/.test(layout)) || !string('minAppVersion', 40) || !/^\d+\.\d+\.\d+$/.test(v.minAppVersion as string) || themeName(v.css as string) !== v.theme) return fail()
  // Packs are portable data. Remote CSS, scripts, embedded documents and external
  // assets are not part of the package format; there is no engine/plugin loader.
  if ('scripts' in v || 'engine' in v) return fail()
  const images = (tokens: Token[]): boolean => tokens.some(token => (token.type === 'image' && !/^(data:|#)/i.test(token.attrGet('src') || '')) || (token.children ? images(token.children) : false))
  const markdown = new MarkdownIt({ html: true })
  const tokens = markdown.parse(v.starter as string, {})
  if (images(tokens)) return fail()
  const html = new DOMParser().parseFromString(markdown.renderer.render(tokens, markdown.options, {}), 'text/html')
  const allCss = [v.css as string, ...Array.from(html.querySelectorAll('style'), element => element.textContent || ''), ...Array.from(html.querySelectorAll('[style]'), element => element.getAttribute('style') || '')].join('\n')
  const imports = [...allCss.matchAll(/@import\s+(?:url\(\s*)?["']?([^\s;"')]+)/gi)]
  if (imports.some(match => !['default', 'gaia', 'uncover'].includes(match[1]))) return fail()
  if ([...allCss.matchAll(/url\(\s*["']?([^\s)'";]+)/gi)].some(match => !/^(data:|#)/i.test(match[1]) && !['default', 'gaia', 'uncover'].includes(match[1]))) return fail()

  if (Array.from(html.querySelectorAll('[src],[poster],image,use')).some(element => {
    const src = element.getAttribute('src') || element.getAttribute('poster') || element.getAttribute('href') || element.getAttribute('xlink:href') || ''
    return src && !/^(data:|#)/i.test(src)
  }) || html.querySelector('[srcset],script,iframe,object,embed,link')) return fail()
  const header = (v.starter as string).match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)
  if (!header) return fail()
  const parsed = parseDocument(header[1]); const data = parsed.toJS({ maxAliasCount: 20 })
  if (parsed.errors.length || data?.marp !== true || data?.theme !== v.theme) return fail()
  const minimum = (v.minAppVersion as string).split('.').map(Number)
  const current = appVersion.split('.').map(Number)
  if (minimum.some((part, index) => part > current[index] && minimum.slice(0, index).every((earlier, before) => earlier === current[before]))) throw new Error('MAR_PORA:themePackNewer')
  // Explicitly project the data fields; unknown executable metadata cannot survive.
  return { schemaVersion: 1, id: v.id as string, version: v.version as string, name: v.name as ThemePack['name'], category: v.category as ThemeCategory, description: v.description as ThemePack['description'], author: v.author as string, license: v.license as string, theme: v.theme as string, layouts: v.layouts as string[], minAppVersion: v.minAppVersion as string, css: v.css as string, starter: v.starter as string }
}

/** Change one scalar's source range, never serialize the YAML document. */
export function applyTheme(source: string, theme: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(theme)) throw new Error('MAR_PORA:themeMetadata')
  const match = source.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$))/)
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  if (!match) return `${source.startsWith('\uFEFF') ? '\uFEFF' : ''}---${eol}marp: true${eol}theme: ${theme}${eol}---${eol}${source.replace(/^\uFEFF/, '')}`
  const yaml = parseDocument(match[2], { uniqueKeys: true })
  if (yaml.errors.length || !isMap(yaml.contents)) throw new Error('MAR_PORA:themeFrontmatter')
  const node = yaml.get('theme', true)
  let header = match[2]
  if (node !== undefined && node !== null) {
    if (!isScalar(node) || !node.range || !['PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE'].includes(node.type || '') || typeof node.value !== 'string') throw new Error('MAR_PORA:themeFrontmatter')
    header = header.slice(0, node.range[0]) + theme + header.slice(node.range[1])
  } else {
    if (yaml.contents.flow) throw new Error('MAR_PORA:themeFrontmatter')
    // Empty theme values have no scalar range. Refuse instead of duplicating a key.
    if (yaml.has('theme')) throw new Error('MAR_PORA:themeFrontmatter')
    header += `${eol}theme: ${theme}`
  }
  return match[1] + header + source.slice(match[1].length + match[2].length)
}
