import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { frontmatter } from './document'
import type Token from 'markdown-it/lib/token.mjs'
import { translator, type Language } from './i18n'
import themeStyles from '../themes.css?raw'

export interface RenderedPreview {
  html: string
  css: string
  titles: string[]
  notes: string[][]
  theme: string
  warning?: string
  positions?: number[]
  aspectRatio?: number
}

export interface RenderOptions {
  mode: 'document' | 'slides'
  themeCss?: string
  language?: Language
}

const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false })

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['pause', 'enter', 'foreignObject', 'style', 'marp-span', 'marp-pre', 'marp-h1', 'marp-h2', 'marp-h3', 'marp-h4', 'marp-h5', 'marp-h6'],
    ADD_ATTR: ['data-marpit-fragment'],
    HTML_INTEGRATION_POINTS: { foreignobject: true, 'annotation-xml': true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'form', 'input', 'button', 'link', 'meta'],
    FORBID_ATTR: ['srcdoc'],
  })
}

function slideTitles(html: string, language: Language = 'en'): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('section')).map((section, i) => section.querySelector('h1,h2,h3')?.textContent?.trim() || translator(language)('slideTitle', { number: i + 1 }))
}

let marpModule: Promise<typeof import('@marp-team/marp-core')> | undefined
let extensionModule: Promise<typeof import('../../examples/uic/engine/marp-engine.mjs')> | undefined

export async function renderPreview(source: string, options: RenderOptions): Promise<RenderedPreview> {
  const t = translator(options.language || 'en')
  const header = frontmatter(source)
  if (options.mode === 'document') {
    return { html: sanitizeHtml(markdown.render(header.body)), css: '', titles: [], notes: [], theme: 'Markdown', warning: header.error }
  }

  marpModule ??= import('@marp-team/marp-core')
  extensionModule ??= import('../../examples/uic/engine/marp-engine.mjs')
  const [{ Marp }, { default: uicEngine }] = await Promise.all([marpModule, extensionModule])
  const marp = new Marp({ html: true, script: false, math: 'katex', emoji: { shortcode: true, unicode: false } })
  const { default: uicCss } = await import('../../examples/uic/theme/uic-cs.css?raw')
  marp.themeSet.add(uicCss)
  if (options.themeCss) marp.themeSet.add(options.themeCss)
  uicEngine({ marp })
  const positions: number[] = []
  const offsets = [0]
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') offsets.push(index + 1)
  // Capture the engine's own slide boundaries after hidden slides and
  // headingDivider have been applied, before SVG wraps the section tokens.
  marp.markdown.core.ruler.after('marpit_slide', 'marpora_source_map', (state: { tokens: Token[]; env: { marporaSourceLines?: number[] } }) => {
    for (const token of state.tokens) {
      if (token.meta?.marpitSlideElement === 1) {
        const line = token.map?.[0] || 0
        positions.push(offsets[state.env.marporaSourceLines?.[line] ?? line] || 0)
      }
    }
  })

  let mathCss = ''
  if (source.includes('$') && header.data.math !== false) {
    const [{ default: katex }, { default: css }] = await Promise.all([
      import('@marp-team/marp-core/plugins/katex'), import('./math-style'),
    ])
    marp.use(katex({ fontPath: false, options: { trust: false, maxExpand: 1000 } }))
    mathCss = css
  }
  const environment = { marporaSourceMap: true, marporaAllHidden: false }
  const rendered = marp.render(source, environment)
  const theme = typeof header.data.theme === 'string' ? header.data.theme : 'default'
  const warning = header.error || (!marp.themeSet.has(theme) ? t('missingTheme', { name: theme }) : undefined)
  const html = environment.marporaAllHidden ? '' : sanitizeHtml(rendered.html)
  const dimensions = new DOMParser().parseFromString(html, 'text/html').querySelector('svg[data-marpit-svg]')?.getAttribute('viewBox')?.split(/\s+/).map(Number)
  const aspectRatio = dimensions && dimensions[3] > 0 ? dimensions[2] / dimensions[3] : 16 / 9
  const slideCss = mathCss ? rendered.css.replace(/@font-face\s*\{[^}]*\}/g, rule => rule.includes('KaTeX_') ? '' : rule) : rendered.css
  return { html, css: `${slideCss}\n${mathCss}`, titles: slideTitles(html, options.language), notes: environment.marporaAllHidden ? [] : rendered.comments, positions: environment.marporaAllHidden ? [] : positions, aspectRatio, theme, warning }
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The preview can render HTML/CSS, but cannot execute document scripts. */
export function previewDocument(result: RenderedPreview, mode: 'document' | 'slides'): string {
  const css = result.css.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob: https: http: asset:; style-src 'unsafe-inline'; font-src 'self' data: https: asset:; script-src 'none'; base-uri 'none'; form-action 'none'"><title>Marpora preview</title><style>${themeStyles}\n${previewStyles}\n${css}</style></head><body class="${mode}"><main id="preview">${result.html}</main></body></html>`
}

export const previewStyles = `
:root{--page:var(--color-paper-3);--ink:var(--color-ink);--muted:var(--color-muted);--line:var(--color-rule);--accent:var(--color-accent);--code:var(--color-paper-2);--font:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}html,body{margin:0;overflow-x:clip}body{background:var(--page);color:var(--ink);font:16px/1.85 var(--font);overflow-wrap:break-word}a{color:var(--accent)}a:focus-visible{outline:2px solid var(--accent)}
.document main{max-width:800px;margin:0 auto;padding:48px 48px 96px}.document h1,.document h2,.document h3{line-height:1.35;font-weight:650;letter-spacing:-.025em}.document h1{font-size:30px;margin:0 0 28px}.document h2{font-size:22px;margin:40px 0 16px}.document h3{font-size:18px;margin-top:28px}.document p{margin:16px 0}.document strong{font-weight:650}.document blockquote{margin:24px 0;padding:2px 20px;border-left:3px solid var(--accent);color:var(--muted);background:var(--code)}.document pre{overflow-x:auto;background:var(--code);padding:20px;border-radius:4px;font-size:13px;line-height:1.8}.document code{font-family:var(--mono);background:var(--code);padding:2px 4px}.document pre code{padding:0}.document table{border-collapse:collapse;width:100%;font-size:14px}.document th,.document td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:left}.document th{background:var(--code)}.document img{max-width:100%;height:auto}.document hr{border:0;border-top:1px solid var(--line);margin:36px 0}.document li{margin:6px 0}
.slides{overflow:hidden;background:#fff;color:#252b35;color-scheme:light}.slides #preview>div{display:grid;place-items:start center}.slides #preview>div>svg{display:none;width:100%;height:auto;max-height:100vh}.slides #preview>div>svg.current{display:block}.slides [data-marpit-fragment].unrevealed{visibility:hidden}.slides img{max-width:100%}
@media(max-width:560px){.document main{padding:28px 24px 64px}.document h1{font-size:26px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`

/** Normalize exported Marp HTML into the same script-free preview as Markdown. */
export function importHtml(source: string, language: Language = 'en'): { result: RenderedPreview; mode: 'slides' | 'document' } {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const slides = Array.from(doc.querySelectorAll('svg[data-marpit-svg]'))
  const css = Array.from(doc.querySelectorAll('style')).map(el => el.textContent || '').join('\n')
  const dimensions = slides[0]?.getAttribute('viewBox')?.split(/\s+/).map(Number)
  const notes: string[][] = slides.map(() => [])
  doc.querySelectorAll('.bespoke-marp-note[data-index]').forEach(note => {
    const index = Number(note.getAttribute('data-index'))
    if (Number.isInteger(index) && notes[index]) notes[index].push(note.textContent?.trim() || '')
  })
  const html = slides.length ? `<div>${slides.map(el => el.outerHTML).join('')}</div>` : doc.body.innerHTML
  return {
    mode: slides.length ? 'slides' : 'document',
    result: { html: sanitizeHtml(html), css: `${css}\n.slides #preview>div>svg{position:relative!important;inset:auto!important;visibility:visible!important;opacity:1!important;transform:translateZ(0)!important}.slides [data-marpit-fragment]{opacity:1!important}`, titles: slides.length ? slideTitles(html, language) : [], notes, theme: 'HTML', aspectRatio: dimensions && dimensions[3] > 0 ? dimensions[2] / dimensions[3] : 16 / 9 },
  }
}
