import { sanitizeHtml, type RenderedPreview } from './render'
import { resource } from './files'
import type { Language } from './i18n'

export interface AudienceDeck { html: string; css: string; titles: string[]; theme: string; aspectRatio: number; fragments: number[] }
export interface SlidePosition { slide: number; step: number; revision: number }
export interface AudienceSnapshot { id: string; title: string; language: Language; deck: AudienceDeck; position: SlidePosition }
export interface PresentationTimer { elapsed: number; startedAt: number | null }
export interface PresenterSession extends AudienceSnapshot { notes: string[][]; timer: PresentationTimer; ready: boolean }
export type PresentationAction = { kind: 'next' | 'previous' | 'first' | 'last' | 'end' | 'timer-toggle' | 'timer-reset' } | { kind: 'goto'; slide: number }
export interface Display { id: string; name: string; width: number; height: number; scaleFactor: number; primary: boolean; current: boolean }

export function reducePosition(fragments: readonly number[], current: SlidePosition, action: PresentationAction): SlidePosition {
  if (!fragments.length) return current
  let { slide, step } = current
  switch (action.kind) {
    case 'next': if (step < fragments[slide]) step++; else if (slide < fragments.length - 1) { slide++; step = 0 }; break
    case 'previous': if (step > 0) step--; else if (slide > 0) { slide--; step = fragments[slide] }; break
    case 'first': slide = 0; step = 0; break
    case 'last': slide = fragments.length - 1; step = 0; break
    case 'goto': if (!Number.isInteger(action.slide)) return current; slide = Math.max(0, Math.min(fragments.length - 1, action.slide)); step = 0; break
    default: return current
  }
  return slide === current.slide && step === current.step ? current : { slide, step, revision: current.revision + 1 }
}
export function elapsedTime(timer: PresentationTimer, now = performance.now()): number { return timer.elapsed + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt)) }
export function timerAction(timer: PresentationTimer, action: 'timer-toggle' | 'timer-reset', now = performance.now()): PresentationTimer {
  return action === 'timer-reset' ? { elapsed: 0, startedAt: timer.startedAt === null ? null : now } : timer.startedAt === null ? { ...timer, startedAt: now } : { elapsed: elapsedTime(timer, now), startedAt: null }
}
export function formatTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  return `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export function keyAction(event: KeyboardEvent): PresentationAction | undefined {
  if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
  if (event.key === ' ' && target?.closest('button')) return
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) return { kind: 'next' }
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) return { kind: 'previous' }
  if (event.key === 'Home') return { kind: 'first' }
  if (event.key === 'End') return { kind: 'last' }
  if (event.key === 'Escape') return { kind: 'end' }
}
export function isAction(value: unknown): value is PresentationAction {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false
  return value.kind === 'goto' ? 'slide' in value && Number.isInteger(value.slide) : ['next', 'previous', 'first', 'last', 'end', 'timer-toggle', 'timer-reset'].includes(String(value.kind))
}
export function audienceSnapshot(session: PresenterSession): AudienceSnapshot {
  return { id: session.id, title: session.title, language: session.language, deck: session.deck, position: session.position }
}

/** Freeze the rendered deck; only local resources need copying to the audience. */
export async function preparePresentation(result: RenderedPreview, path: string | null): Promise<AudienceDeck> {
  const doc = new DOMParser().parseFromString(sanitizeHtml(result.html), 'text/html')
  const slides = Array.from(doc.querySelectorAll('svg[data-marpit-svg]'))
  if (!slides.length) throw new Error('MAR_PORA:emptySlides')
  const local = (url: string) => !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)
  const cache = new Map<string, Promise<string>>()
  const embed = (url: string) => { if (!cache.has(url)) cache.set(url, resource(path, url)); return cache.get(url)! }
  await Promise.all(Array.from(doc.querySelectorAll('img,image')).map(async element => {
    const attribute = element.tagName.toLowerCase() === 'img' ? 'src' : element.hasAttribute('href') ? 'href' : 'xlink:href'
    const url = element.getAttribute(attribute)
    if (url && local(url)) element.setAttribute(attribute, await embed(url))
    element.removeAttribute('srcset')
  }))
  let css = result.css
  const urls = [...new Set(Array.from(css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g), match => match[1]))]
  for (const url of urls) if (local(url)) css = css.split(url).join(await embed(url))
  return { html: doc.body.innerHTML, css, titles: slides.map((slide, index) => result.titles[index] || String(index + 1)), theme: result.theme, aspectRatio: result.aspectRatio || 16 / 9, fragments: slides.map(slide => Math.max(0, ...Array.from(slide.querySelectorAll('[data-marpit-fragment]'), element => Number(element.getAttribute('data-marpit-fragment')) || 0))) }
}
