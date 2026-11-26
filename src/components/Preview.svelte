<script lang="ts">
  import { tick } from 'svelte'
  import { previewDocument, type RenderedPreview } from '../lib/render'
  import { resolveImages } from '../lib/files'

  let { result, mode, slide, step, path, progress, sync, onkey }: {
    result: RenderedPreview; mode: 'document' | 'slides'; slide: number; step: number;
    path: string | null; progress: number; sync: boolean;
    onkey: (event: KeyboardEvent) => void;
  } = $props()
  let frame = $state<HTMLIFrameElement>()
  let ready = $state(0)
  let count = $derived(result.titles.length)
  const doc = $derived(previewDocument(result, mode))

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
  }

  async function loaded() {
    ready += 1
    updateSlide()
    if (!frame) return
    await resolveImages(frame, path)
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
    <div class="empty-preview"><h2>没有可显示的幻灯片</h2><p>检查隐藏标记，或添加一些内容。</p></div>
  {:else}
    <!-- Scripts stay disabled; same-origin access is only for navigation and scaling. -->
    <iframe bind:this={frame} title={mode === 'slides' ? 'Marp 幻灯片预览' : 'Markdown 实时预览'} sandbox="allow-same-origin" srcdoc={doc} onload={loaded} class:slide-frame={mode === 'slides'} style:--slide-ratio={result.aspectRatio || 16 / 9}></iframe>
  {/if}
</div>
