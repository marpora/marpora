import { invoke, isTauri } from '@tauri-apps/api/core'
import { translator, type Language } from './i18n'

export interface OpenDocument { path: string; text: string; lineEnding: 'lf' | 'crlf'; bom: boolean; kind?: 'markdown' | 'html' | 'pdf'; data?: string }
export const desktop = isTauri()

export async function openDocument(language: Language = 'en'): Promise<OpenDocument | null> {
  if (desktop) return invoke('open_document')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdown,.txt,.html,.htm,.pdf'
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        resolve(await documentFromFile(file, language))
      } catch (cause) { reject(cause) }
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function documentFromFile(file: File, language: Language = 'en'): Promise<OpenDocument> {
  const pdf = /\.pdf$/i.test(file.name)
  if (file.size > (pdf ? 64 : 16) * 1024 * 1024) throw new Error(translator(language)(pdf ? 'pdfTooLarge' : 'documentTooLarge'))
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (pdf) {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Invalid PDF')
    let binary = ''
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768))
    return { path: file.name, kind: 'pdf', data: btoa(binary), text: '', lineEnding: 'lf', bom: false }
  }
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  return { path: file.name, kind: /\.html?$/i.test(file.name) ? 'html' : 'markdown', text: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), lineEnding: raw.includes('\r\n') ? 'crlf' : 'lf', bom: raw.startsWith('\uFEFF') }
}

export async function resource(documentPath: string | null, relativePath: string): Promise<string> {
  if (desktop && documentPath) return invoke<string>('read_resource', { documentPath, relativePath: decodeURIComponent(relativePath) })
  if (documentPath) {
    const data = await (await import('./folders')).browserResource(documentPath, relativePath)
    if (data) return data
  }
  throw new Error(`Resource unavailable: ${relativePath}`)
}

export async function saveDocument(path: string | null, text: string, expected: string | null, format: { lineEnding: 'lf' | 'crlf'; bom: boolean; suggestedName: string }): Promise<string | null> {
  if (desktop) return invoke('save_document', { path, text, expected, ...format })
  download(path?.split(/[\\/]/).pop() || format.suggestedName, `${format.bom ? '\uFEFF' : ''}${format.lineEnding === 'crlf' ? text.replace(/\n/g, '\r\n') : text}`, 'text/markdown;charset=utf-8')
  return path || format.suggestedName
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function loadTheme(language: Language = 'en'): Promise<string | null> {
  if (desktop) return invoke('open_theme')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.css,.json'
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        if (file.size > 2 * 1024 * 1024) throw new Error(translator(language)('themeTooLarge'))
        resolve(await file.text())
      } catch (cause) { reject(cause) }
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function resolveImages(frame: HTMLIFrameElement, path: string | null, language: Language = 'en'): Promise<void> {
  if (!path) return
  const images = Array.from(frame.contentDocument?.querySelectorAll('img, image') || [])
  await Promise.all(images.map(async (image) => {
    const attribute = image.tagName.toLowerCase() === 'img' ? 'src' : image.hasAttribute('href') ? 'href' : 'xlink:href'
    const src = image.getAttribute(attribute)
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return
    try {
      const data = await resource(path, src)
      if (image.isConnected) image.setAttribute(attribute, data)
    } catch { image.setAttribute('aria-label', `[${translator(language)('imageFailed')}] ${image.getAttribute('alt') || src}`) }
  }))
}

export async function saveThemePack(pack: { theme: string }, content: string): Promise<boolean> {
  if (desktop) return invoke('save_theme_pack', { suggestedName: `${pack.theme}.marpora.json`, content })
  download(`${pack.theme}.marpora.json`, content, 'application/json'); return true
}
