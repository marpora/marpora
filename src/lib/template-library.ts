import type { ThemeManifest, ThemePack } from './theme-pack'
import { reservedThemes, themeName, validatePack } from './theme-pack'
const manifests = import.meta.glob<ThemeManifest>('../../templates/*/manifest.json', { eager: true, import: 'default' })
const text = import.meta.glob<string>('../../templates/*/{theme.css,starter.md}', { eager: true, query: '?raw', import: 'default' })
const covers = import.meta.glob<string>('../../templates/*/cover.png', { eager: true, query: '?url', import: 'default' })
export const builtins: ThemePack[] = ['orbit', 'chalk', 'thesis', 'brief'].map(id => {
  const directory = `../../templates/${id}`
  return { ...manifests[`${directory}/manifest.json`], css: text[`${directory}/theme.css`], starter: text[`${directory}/starter.md`] }
})
export const isBuiltin = (pack: ThemePack) => builtins.some(item => item.id === pack.id)
export const coverFor = (pack: ThemePack) => isBuiltin(pack) ? covers[`../../templates/${pack.id.split('/')[1]}/cover.png`] : undefined
let library: ThemePack[] = [...builtins]
let loading: Promise<ThemePack[]> | undefined
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('MAR_PORA:themeStorage')); return }
    const request = indexedDB.open('marpora.themes.v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('MAR_PORA:themeStorage'))
    request.onblocked = () => reject(new Error('MAR_PORA:themeStorage'))
  })
}
async function validateCss(pack: ThemePack): Promise<void> {
  try {
    const { Marp } = await import('@marp-team/marp-core')
    const marp = new Marp({ html: true, script: false, math: false })
    marp.themeSet.add(pack.css)
    marp.render(pack.starter)
  } catch { throw new Error('MAR_PORA:invalidThemePack') }
}
export function loadLibrary(): Promise<ThemePack[]> {
  loading ??= (async () => {
    try {
      const db = await database()
      const stored = await new Promise<unknown[]>((resolve, reject) => { const tx = db.transaction('packs'); const request = tx.objectStore('packs').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.oncomplete = () => db.close() })
      for (const item of stored) {
        try { const pack = validatePack(item); await validateCss(pack); if (!reservedThemes.has(pack.theme) && !library.some(existing => existing.id === pack.id || existing.theme === pack.theme)) library.push(pack) } catch { /* An invalid optional pack cannot break built-in themes. */ }
      }
    } catch { /* Built-in templates work when optional storage is unavailable. */ }
    return library
  })()
  return loading
}
export async function installPack(pack: ThemePack): Promise<void> {
  const checked = validatePack(pack)
  await loadLibrary()
  if (reservedThemes.has(checked.theme) || library.some(existing => existing.id === checked.id || existing.theme === checked.theme)) throw new Error('MAR_PORA:themeConflict')
  await validateCss(checked)
  if (library.length >= 54) throw new Error('MAR_PORA:themeLibraryFull')
  const db = await database()
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('packs', 'readwrite'); tx.objectStore('packs').add(checked); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => { db.close(); reject(new Error('MAR_PORA:themeStorage')) }; tx.onabort = () => { db.close(); reject(new Error('MAR_PORA:themeStorage')) } })
  library.push(checked)
}
export async function importPack(source: string): Promise<ThemePack> {
  if (new TextEncoder().encode(source).length > 2 * 1024 * 1024) throw new Error('MAR_PORA:themeTooLarge')
  let pack: ThemePack
  if (source.trimStart().startsWith('{')) {
    try { pack = validatePack(JSON.parse(source.replace(/^\uFEFF/, ''))) } catch (error) { if (error instanceof SyntaxError) throw new Error('MAR_PORA:invalidThemePack'); throw error }
  } else {
    const name = themeName(source)
    if (!name) throw new Error('MAR_PORA:themeMetadata')
    pack = { schemaVersion: 1, id: `local/theme-${name.toLowerCase()}`, version: '1.0.0', name: { en: name, zh: name }, description: { en: 'An imported local CSS theme.', zh: '导入的本地 CSS 主题。' }, category: 'custom', author: 'Local', license: 'See original CSS', theme: name, layouts: [], minAppVersion: '0.4.0', css: source, starter: `---\nmarp: true\ntheme: ${name}\n---\n# ${name}\n\nStart your presentation here.\n` }
  }
  await installPack(pack); return pack
}
