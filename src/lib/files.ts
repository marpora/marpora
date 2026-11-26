import { invoke, isTauri } from '@tauri-apps/api/core'

export interface OpenDocument { path: string; text: string; lineEnding: 'lf' | 'crlf'; bom: boolean }
export const desktop = isTauri()

export async function openDocument(): Promise<OpenDocument | null> {
  if (desktop) return invoke('open_document')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdown,.txt'
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        if (file.size > 16 * 1024 * 1024) throw new Error('文档超过 16 MB。')
        const raw = await file.text()
        resolve({ path: file.name, text: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), lineEnding: raw.includes('\r\n') ? 'crlf' : 'lf', bom: raw.startsWith('\uFEFF') })
      } catch (cause) { reject(cause) }
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
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

export async function loadTheme(): Promise<string | null> {
  if (desktop) return invoke('open_theme')
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.css'
    input.onchange = async () => {
      try {
        const file = input.files?.[0]
        if (!file) return resolve(null)
        if (file.size > 2 * 1024 * 1024) throw new Error('主题超过 2 MB。')
        resolve(await file.text())
      } catch (cause) { reject(cause) }
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function resolveImages(frame: HTMLIFrameElement, path: string | null): Promise<void> {
  if (!desktop || !path) return
  const images = Array.from(frame.contentDocument?.querySelectorAll('img, image') || [])
  await Promise.all(images.map(async (image) => {
    const attribute = image.tagName.toLowerCase() === 'img' ? 'src' : image.hasAttribute('href') ? 'href' : 'xlink:href'
    const src = image.getAttribute(attribute)
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return
    try {
      const data = await invoke<string>('read_image', { documentPath: path, relativePath: decodeURIComponent(src) })
      if (image.isConnected) image.setAttribute(attribute, data)
    } catch { image.setAttribute('aria-label', `[图片未能加载] ${image.getAttribute('alt') || src}`) }
  }))
}
