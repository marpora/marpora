<script lang="ts">
  import { tick, onMount } from 'svelte'
  import { previewDocument, type RenderedPreview } from '../lib/render'
  import { resolveImages } from '../lib/files'
  import { translator, type Language } from '../lib/i18n'
  import type { Accent } from '../lib/preferences'

  let { result, mode, slide, step, path, progress, sync, onkey, language = 'en', scheme = 'light', accent = 'system' }: {
    result: RenderedPreview; mode: 'document' | 'slides'; slide: number; step: number;
    path: string | null; progress: number; sync: boolean;
    onkey: (event: KeyboardEvent) => void;
    language?: Language; scheme?: 'light' | 'dark'; accent?: Accent;
  } = $props()
  let frame = $state<HTMLIFrameElement>()
  let ready = $state(0)
  let polyfill: Array<(options: { target: ParentNode }) => void> = []
  function fixScale() { const target = frame?.contentDocument; if (target && mode === 'slides') polyfill.forEach(apply => apply({ target })) }
  onMount(() => {
    let disposed = false
    const observer = new ResizeObserver(() => fixScale())
    void import('@marp-team/marpit-svg-polyfill').then(async ({ polyfills }) => {
      const required = await polyfills()
      if (!disposed) { polyfill = required; fixScale() }
    })
    const watch = () => { observer.disconnect(); if (frame) observer.observe(frame) }
    watchFrame = watch; watch()
    return () => { disposed = true; observer.disconnect() }
  })
  let watchFrame = () => {}
  let count = $derived(result.titles.length)
  const doc = $derived(previewDocument(result, mode))
  const t = $derived(translator(language))

  $effect(() => {
    void ready
    const root = frame?.contentDocument?.documentElement
    if (root) { root.lang = language; root.dataset.theme = scheme; root.dataset.accent = accent }
  })

  function updateSlide() {
    const root = frame?.contentDocument
    if (!root || mode !== 'slides') return
    const slides = root.querySelectorAll('#preview > div > svg')
    slides.forEach((el, i) => {
      el.classList.toggle('current', i === slide)
      el.querySelectorAll('[data-marpit-fragment]').forEach((fragment) => {
        fragment.classList.toggle('unrevealed', Number(fragment.getAttribute('data-marpit-fragment')) > step)
      })
    })
    fixScale()
  }

  async function loaded() {
    ready += 1
    watchFrame()
    updateSlide()
    if (!frame) return
    await resolveImages(frame, path, language)
    const content = frame.contentDocument
    content?.addEventListener('keydown', onkey)
    // Keep authored links from navigating the editor or invoking OS protocols.
    content?.addEventListener('click', (event) => {
      const link = (event.target as Element).closest('a')
      if (!link) return
      event.preventDefault()
      const href = link.getAttribute('href')
      if (href?.startsWith('#')) content.getElementById(href.slice(1))?.scrollIntoView()
    })
  }

  $effect(() => { void slide; void step; void ready; updateSlide() })
  $effect(() => {
    const position = progress
    void ready
    if (mode === 'document' && sync && frame?.contentDocument) {
      const el = frame.contentDocument.scrollingElement
      if (el) el.scrollTop = position * Math.max(0, el.scrollHeight - el.clientHeight)
    }
  })

  export function fragmentCount(): number {
    const current = frame?.contentDocument?.querySelector('svg.current')
    return Math.max(0, ...Array.from(current?.querySelectorAll('[data-marpit-fragment]') || []).map(el => Number(el.getAttribute('data-marpit-fragment')) || 0))
  }
  export async function present() {
    await tick()
    updateSlide()
  }
</script>

<div class:slide-stage={mode === 'slides'} class="preview-frame-wrap" data-testid="preview-surface">
  {#if mode === 'slides' && count === 0}
    <div class="empty-preview"><h2>{t('emptySlides')}</h2><p>{t('emptySlidesHint')}</p></div>
  {:else}
    <!-- Scripts stay disabled; same-origin access is only for navigation and scaling. -->
    <iframe bind:this={frame} title={mode === 'slides' ? t('slidePreview') : t('documentPreview')} sandbox="allow-same-origin" tabindex={mode === 'slides' ? -1 : 0} srcdoc={doc} onload={loaded} class:slide-frame={mode === 'slides'} style:--slide-ratio={result.aspectRatio || 16 / 9}></iframe>
  {/if}
</div>
