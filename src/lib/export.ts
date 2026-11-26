import { invoke } from '@tauri-apps/api/core'
import { desktop, download, resource } from './files'
import { escapeAttribute, previewStyles, type RenderedPreview } from './render'
import svgPolyfill from '@marp-team/marpit-svg-polyfill/lib/polyfill.browser.js?raw'
import themeStyles from '../themes.css?raw'

const relative = (url: string) => !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(url)
async function inlineResource(url: string, path: string | null): Promise<string> {
  if (/^data:|^#/i.test(url)) return url
  if (relative(url) && !url.startsWith('/')) return resource(path, url)
  // Fetch only resources already reachable by the local renderer (bundled fonts or remote images).
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Resource unavailable: ${url}`)
  const blob = await response.blob()
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
}

export async function standaloneHtml(result: RenderedPreview, mode: 'slides' | 'document', path: string | null, title: string, language = 'en'): Promise<{ html: string; pages: number; width: number; height: number }> {
  const doc = new DOMParser().parseFromString(`<main id="preview">${result.html}</main>`, 'text/html')
  await Promise.all(Array.from(doc.querySelectorAll('img,image')).map(async image => {
    const attribute = image.tagName.toLowerCase() === 'img' ? 'src' : image.hasAttribute('href') ? 'href' : 'xlink:href'
    const src = image.getAttribute(attribute)
    if (src) image.setAttribute(attribute, await inlineResource(src, path))
    image.removeAttribute('srcset')
  }))
  let css = `${themeStyles}\n${previewStyles}\n${result.css}`
  const urls = [...new Set(Array.from(css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g), match => match[1]))]
  for (const url of urls) {
    if (url.startsWith('#') || url.startsWith('data:')) continue
    const embedded = await inlineResource(url, path)
    css = css.split(url).join(embedded)
  }
  const svg = doc.querySelector('svg[data-marpit-svg]')
  const dimensions = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number)
  const width = dimensions?.[2] || 1280, height = dimensions?.[3] || 720
  const pages = mode === 'slides' ? doc.querySelectorAll('#preview>div>svg').length : 0
  const style = `
body.slides{height:100vh;background:#fff}.slides #preview>div{height:100vh;display:grid;place-items:center}.slides #preview>div>svg{max-height:100vh;width:100vw;height:100vh;position:relative!important;inset:auto!important;opacity:1!important;transform:translateZ(0)!important}.slides #preview>div>svg.current{display:block!important}.slides [data-marpit-fragment]{opacity:1!important}.pdf-capture .export-counter{display:none}.export-counter{position:fixed;right:12px;bottom:8px;font:12px system-ui;color:#667;opacity:.7}.document{--page:white;--ink:#252b35;--muted:#667;--line:#ddd;--accent:#2855c5;--code:#f5f5f7}
@page{size:${mode === 'slides' ? `${width}px ${height}px` : 'A4'};margin:${mode === 'slides' ? '0' : '12mm'}}
@media print{html,body.slides,.slides #preview>div{height:auto!important;overflow:visible!important;display:block!important}.slides #preview>div>svg{display:block!important;width:${width}px!important;height:${height}px!important;max-height:none!important;break-after:page;page-break-after:always}.slides #preview>div>svg:last-child{break-after:auto;page-break-after:auto}.slides [data-marpit-fragment]{visibility:visible!important}.export-counter{display:none}.document main{padding:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`
  // Only this app-owned script executes. Authored scripts were removed before export.
  const script = `(()=>{const slides=[...document.querySelectorAll('#preview>div>svg')];let index=0,step=Infinity;const counter=document.querySelector('.export-counter');function show(n,all=false){index=Math.max(0,Math.min(n,slides.length-1));step=all?Infinity:0;paint()}function paint(){slides.forEach((s,i)=>{s.classList.toggle('current',i===index);s.querySelectorAll('[data-marpit-fragment]').forEach(f=>f.classList.toggle('unrevealed',Number(f.dataset.marpitFragment)>step))});if(counter)counter.textContent=(index+1)+' / '+slides.length}window.MarporaExport={show:(n,all)=>{document.body.classList.add('pdf-capture');show(n,all)}};show(Math.max(0,Number(location.hash.slice(1))-1),true);document.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();const max=Math.max(0,...[...slides[index].querySelectorAll('[data-marpit-fragment]')].map(f=>Number(f.dataset.marpitFragment)||0));if(step<max){step++;paint()}else{show(index+1);history.replaceState(null,'','#'+(index+1))}}if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();show(index-1,true);history.replaceState(null,'','#'+(index+1))}if(e.key==='Home')show(0,true);if(e.key==='End')show(slides.length-1,true);if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.()});})()`
  return { html: `<!doctype html><html lang="${escapeAttribute(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeAttribute(title)}</title><style>${(css + style).replace(/<\/style/gi, '<\\/style')}</style></head><body class="${mode}">${doc.body.innerHTML}${pages ? `<div class="export-counter" aria-live="polite"></div><script>${svgPolyfill.replace(/<\/script/gi, '<\\/script')}\n${script}</script>` : ''}</body></html>`, pages, width, height }
}

export async function writeExport(payload: Awaited<ReturnType<typeof standaloneHtml>>, format: 'html' | 'pdf', name: string): Promise<string | null> {
  const suggestedName = name.replace(/\.[^.]+$/, '') + '.' + format
  if (desktop) return invoke('export_document', { ...payload, format, suggestedName })
  if (format === 'html') { download(suggestedName, payload.html, 'text/html;charset=utf-8'); return suggestedName }
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Allow the print window to export PDF.')
  popup.document.write(payload.html); popup.document.close()
  await popup.document.fonts.ready
  await Promise.all(Array.from(popup.document.images).map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve })))
  popup.focus(); popup.print()
  return null
}
