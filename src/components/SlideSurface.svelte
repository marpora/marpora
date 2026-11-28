<script lang="ts">
  import { onMount } from 'svelte'
  import { previewDocument } from '../lib/render'
  import type { AudienceDeck } from '../lib/presentation'
  let { deck, slide = 0, step = Infinity, title, strip = false, thumbHeight = 100, onready }: { deck: AudienceDeck; slide?: number; step?: number; title: string; strip?: boolean; thumbHeight?: number; onready?: () => void } = $props()
  let frame = $state<HTMLIFrameElement>()
  let ready = $state(0)
  let polyfill: Array<(options: { target: ParentNode }) => void> = []
  let observe = () => {}
  const css = $derived(strip ? `body.slides{overflow:hidden}.slides #preview>div{display:flex!important;gap:16px;padding:0 12px}.slides #preview>div>svg{display:block!important;width:${thumbHeight * deck.aspectRatio}px!important;height:${thumbHeight}px!important;max-height:none!important;flex:none}` : 'html,body.slides,.slides #preview,.slides #preview>div{height:100%;overflow:hidden}.slides{background:#090d15}.slides #preview>div{place-items:center}.slides #preview>div>svg.current{width:100%;height:100%;max-height:100vh}')
  const html = $derived(previewDocument({ ...deck, css: deck.css + '\n' + css, notes: [] }, 'slides'))
  function update() {
    const target = frame?.contentDocument
    if (!target) return
    target.querySelectorAll('#preview>div>svg').forEach((svg, index) => {
      svg.classList.toggle('current', index === slide)
      svg.querySelectorAll('[data-marpit-fragment]').forEach(fragment => fragment.classList.toggle('unrevealed', !strip && Number(fragment.getAttribute('data-marpit-fragment')) > step))
    })
    polyfill.forEach(apply => apply({ target }))
  }
  onMount(() => {
    let disposed = false
    const observer = new ResizeObserver(update)
    observe = () => { observer.disconnect(); if (frame) observer.observe(frame) }
    observe()
    void import('@marp-team/marpit-svg-polyfill').then(async ({ polyfills }) => { const required = await polyfills(); if (!disposed) { polyfill = required; update() } })
    return () => { disposed = true; observer.disconnect() }
  })
  async function loaded() {
    ready++; observe(); update()
    await frame?.contentDocument?.fonts.ready
    update(); onready?.()
  }
  $effect(() => { void ready; void slide; void step; void strip; update() })
</script>
<iframe class="presentation-surface" bind:this={frame} {title} sandbox="allow-same-origin" tabindex="-1" srcdoc={html} onload={loaded}></iframe>
