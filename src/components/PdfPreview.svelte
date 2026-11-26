<script lang="ts">
  import { translator, type Language } from '../lib/i18n'
  import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
  let { data, page = 1, onpage, language = 'en' }: { data: Uint8Array; page?: number; onpage: (value: number) => void; language?: Language } = $props()
  const t = $derived(translator(language))
  let canvas: HTMLCanvasElement
  let pdf = $state<PDFDocumentProxy>()
  let count = $state(0)
  let zoom = $state(100)
  let error = $state('')
  let loading = $state(true)
  let renderTask: RenderTask | undefined
  let generation = 0
  $effect(() => {
    const bytes = data
    let disposed = false
    let destroy: (() => void) | undefined
    loading = true; error = ''; pdf = undefined; count = 0
    void (async () => {
      const [library, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')])
      if (disposed) return
      library.GlobalWorkerOptions.workerSrc = worker.default
      const base = new URL('./pdfjs/', window.location.href).href
      const task = library.getDocument({ data: bytes.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` })
      destroy = () => { void task.destroy() }
      const document = await task.promise
      if (disposed) { void task.destroy(); return }
      pdf = document; count = document.numPages
    })().catch(cause => { if (!disposed) { error = String(cause); loading = false } })
    return () => { disposed = true; generation++; renderTask?.cancel(); destroy?.() }
  })
  $effect(() => {
    const document = pdf, number = Math.max(1, Math.min(page, count || 1)), scale = zoom / 100
    const id = ++generation
    renderTask?.cancel()
    if (!document || !canvas) return
    loading = true
    void (async () => {
      const sheet = await document.getPage(number)
      if (id !== generation) return
      const viewport = sheet.getViewport({ scale: scale * Math.min(devicePixelRatio || 1, 2) })
      canvas.width = viewport.width; canvas.height = viewport.height
      canvas.style.width = `${viewport.width / Math.min(devicePixelRatio || 1, 2)}px`
      canvas.style.height = `${viewport.height / Math.min(devicePixelRatio || 1, 2)}px`
      renderTask = sheet.render({ canvas, viewport })
      await renderTask.promise
      if (id === generation) { loading = false; error = '' }
    })().catch(cause => { if (id === generation && cause?.name !== 'RenderingCancelledException') { error = String(cause); loading = false } })
  })
</script>
<section class="pdf-preview" aria-label="PDF">
  <div class="pdf-controls pane-heading">
    <div class="pane-tools"><button aria-label={t('previousPage')} disabled={page <= 1} onclick={() => onpage(page - 1)}>←</button><label>{t('page')} <input aria-label={t('page')} type="number" min="1" max={count || 1} value={page} onchange={event => onpage(Math.max(1, Math.min(count, +event.currentTarget.value)))}/></label><span data-testid="pdf-counter">/ {count}</span><button aria-label={t('nextPage')} disabled={page >= count} onclick={() => onpage(page + 1)}>→</button></div>
    <label>{t('zoom')} <select bind:value={zoom}>{#each [50, 75, 100, 125, 150, 200] as value}<option value={value}>{value}%</option>{/each}</select></label>
  </div>
  {#if error}<div class="notice error" role="alert">{t('pdfFailed', { error })}</div>{/if}
  <div class="pdf-canvas-wrap" aria-busy={loading}>{#if loading}<span class="pdf-loading" role="status">{t('loading')}</span>{/if}<canvas bind:this={canvas} aria-label={`PDF — ${t('page')} ${page}`}></canvas></div>
</section>
