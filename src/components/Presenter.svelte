<script lang="ts">
  import { onMount } from 'svelte'
  import { elapsedTime, formatTime, type PresenterSession, type PresentationAction } from '../lib/presentation'
  import { translator } from '../lib/i18n'
  import SlideSurface from './SlideSurface.svelte'
  let { session, onaction, onshowaudience }: { session: PresenterSession; onaction: (action: PresentationAction) => void; onshowaudience: () => void } = $props()
  const t = $derived(translator(session.language))
  let now = $state(performance.now())
  let columns = $state(65), nextHeight = $state(43), stripHeight = $state(148)
  let layout = $state<HTMLDivElement>(), body = $state<HTMLDivElement>(), strip = $state<HTMLElement>()
  let resizing = $state<'columns' | 'next' | 'strip' | null>(null)
  let thumbs = $state<HTMLButtonElement[]>([])
  const position = $derived(session.position), deck = $derived(session.deck)
  const notes = $derived(session.notes[position.slide]?.join('\n\n') || '')
  const thumbHeight = $derived(stripHeight - 40)
  const thumbWidth = $derived(thumbHeight * deck.aspectRatio)
  const stripWidth = $derived(24 + deck.fragments.length * (thumbWidth + 16) - 16)
  const atStart = $derived(position.slide === 0 && position.step === 0)
  const atEnd = $derived(position.slide === deck.fragments.length - 1 && position.step >= deck.fragments[position.slide])
  onMount(() => {
    layout?.focus({ preventScroll: true })
    try {
      const stored = JSON.parse(localStorage.getItem('marpora.presenter.layout.v1') || 'null')
      if (stored) { columns = Math.max(35, Math.min(75, Number(stored.columns) || 65)); nextHeight = Math.max(20, Math.min(65, Number(stored.nextHeight) || 43)); stripHeight = Math.max(90, Math.min(240, Number(stored.stripHeight) || 148)) }
    } catch { /* Optional layout preferences. */ }
    const clock = setInterval(() => now = performance.now(), 250)
    return () => clearInterval(clock)
  })
  $effect(() => { try { localStorage.setItem('marpora.presenter.layout.v1', JSON.stringify({ columns, nextHeight, stripHeight })) } catch { /* Optional storage. */ } })
  $effect(() => {
    void position.slide; void stripHeight
    const button = thumbs[position.slide]
    if (button && strip) {
      // Scroll only the thumbnail row; scrollIntoView can move the whole console.
      const bounds = button.getBoundingClientRect(), visible = strip.getBoundingClientRect()
      if (bounds.left < visible.left || bounds.right > visible.right) strip.scrollTo({ left: button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2, behavior: 'smooth' })
    }
  })
  function resize(event: PointerEvent) {
    if (!resizing) return
    const rect = body!.getBoundingClientRect()
    if (resizing === 'columns') columns = Math.max(35, Math.min(75, (event.clientX - rect.left) / rect.width * 100))
    if (resizing === 'next') nextHeight = Math.max(20, Math.min(65, (event.clientY - rect.top) / rect.height * 100))
    if (resizing === 'strip') stripHeight = Math.max(90, Math.min(layout!.clientHeight * .35, layout!.getBoundingClientRect().bottom - event.clientY))
  }
</script>
<svelte:window onpointermove={resize} onpointerup={() => resizing = null}/>
<div class="presenter-console" tabindex="-1" bind:this={layout} data-testid="presenter" data-slide={position.slide} data-step={position.step} data-revision={position.revision} style:--presenter-columns={`${columns}%`} style:--presenter-next={`${nextHeight}%`} style:--presenter-strip={`${stripHeight}px`}>
  <header class="presenter-toolbar"><div><strong>{t('presenterView')}</strong><span>{session.title}</span></div><div class="presenter-clock"><output aria-label={t('elapsedTime')} data-testid="presenter-timer">{formatTime(elapsedTime(session.timer, now))}</output><button onclick={() => onaction({ kind: 'timer-toggle' })} disabled={!session.ready}>{session.timer.startedAt === null ? t('resumeTimer') : t('pauseTimer')}</button><button onclick={() => onaction({ kind: 'timer-reset' })} disabled={!session.ready}>{t('resetTimer')}</button></div><button class="presenter-show-audience" onclick={onshowaudience}>{t('showAudience')}</button><button class="presenter-end" onclick={() => onaction({ kind: 'end' })}>{t('endPresentation')} <kbd>Esc</kbd></button></header>
  {#if !session.ready}<div class="presenter-waiting" role="status">{t('waitingForAudience')}</div>{/if}
  <div class="presenter-body" bind:this={body}>
    <section class="presenter-current"><h2>{t('currentSlide')}</h2><div class="presenter-slide-space"><div class="presenter-slide" style:--deck-ratio={deck.aspectRatio}><SlideSurface {deck} slide={position.slide} step={position.step} title={t('currentSlide')}/></div></div></section>
    <button class="presenter-handle presenter-column-handle" aria-label={t('resizePresenterColumns')} title={t('resizePresenterHint')} onpointerdown={event => { resizing = 'columns'; event.currentTarget.setPointerCapture(event.pointerId) }} ondblclick={() => columns = 65} onkeydown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); columns = Math.max(35, columns - 2) }; if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); columns = Math.min(75, columns + 2) } }}></button>
    <div class="presenter-side"><section class="presenter-next"><h2>{t('nextSlidePreview')}</h2>{#if position.slide < deck.fragments.length - 1}<div class="presenter-slide-space"><div class="presenter-slide" style:--deck-ratio={deck.aspectRatio}><SlideSurface {deck} slide={position.slide + 1} title={t('nextSlidePreview')}/></div></div>{:else}<div class="presenter-last">{t('lastSlide')}</div>{/if}</section>
      <button class="presenter-handle presenter-row-handle" aria-label={t('resizeNextSlide')} title={t('resizePresenterHint')} onpointerdown={event => { resizing = 'next'; event.currentTarget.setPointerCapture(event.pointerId) }} ondblclick={() => nextHeight = 43} onkeydown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); nextHeight = Math.max(20, nextHeight - 2) }; if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); nextHeight = Math.min(65, nextHeight + 2) } }}></button>
      <section class="presenter-notes"><h2>{t('speakerNotes')}</h2><div data-testid="presenter-notes">{notes || t('noNotes')}</div></section></div>
  </div>
  <div class="presenter-navigation"><button aria-label={t('previousSlide')} disabled={atStart} onclick={() => onaction({ kind: 'previous' })}>←</button><span data-testid="presenter-counter">{position.slide + 1} / {deck.fragments.length}</span><span class="presenter-step" data-testid="presenter-step">{t('fragmentStep', { current: position.step, total: deck.fragments[position.slide] })}</span><button aria-label={t('nextSlide')} disabled={atEnd} onclick={() => onaction({ kind: 'next' })}>→</button><span class="presenter-key-hint">{t('presenterKeys')}</span></div>
  <button class="presenter-handle presenter-strip-handle" aria-label={t('resizeThumbnails')} title={t('resizePresenterHint')} onpointerdown={event => { resizing = 'strip'; event.currentTarget.setPointerCapture(event.pointerId) }} ondblclick={() => stripHeight = 148} onkeydown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); stripHeight = Math.min(240, stripHeight + 8) }; if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); stripHeight = Math.max(90, stripHeight - 8) } }}></button>
  <nav class="presenter-thumbnails" aria-label={t('slideNavigation')} bind:this={strip}><div class="presenter-thumbnail-track" style:width={`${stripWidth}px`}>
    <div class="presenter-thumbnail-surface" style:height={`${thumbHeight}px`}><SlideSurface {deck} strip {thumbHeight} title={t('slideThumbnails')}/></div>
    {#each deck.titles as title, index}<button class="presenter-thumbnail" class:current={index === position.slide} style:left={`${12 + index * (thumbWidth + 16)}px`} style:width={`${thumbWidth}px`} style:height={`${thumbHeight}px`} aria-label={`${index + 1}. ${title}`} aria-current={index === position.slide ? 'page' : undefined} bind:this={thumbs[index]} onclick={() => onaction({ kind: 'goto', slide: index })}><span>{String(index + 1).padStart(2, '0')} · {title}</span></button>{/each}
  </div></nav>
</div>
