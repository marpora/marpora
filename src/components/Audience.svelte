<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { desktop } from '../lib/files'
  import { translator, errorMessage } from '../lib/i18n'
  import { keyAction, type AudienceSnapshot, type SlidePosition, type PresentationAction } from '../lib/presentation'
  import SlideSurface from './SlideSurface.svelte'
  let { id }: { id: string } = $props()
  let snapshot = $state<AudienceSnapshot | null>(null), error = $state(''), ended = $state(false)
  let channel: BroadcastChannel | undefined
  let pending: SlidePosition | undefined
  let markReady = () => {}
  const t = $derived(translator(snapshot?.language || 'en'))
  function position(next: SlidePosition) {
    const current = snapshot?.position || pending
    if (current && next.revision <= current.revision) return
    if (snapshot) snapshot = { ...snapshot, position: next }; else pending = next
  }
  function receive(next: AudienceSnapshot) {
    if (next.id !== id) return
    const current = snapshot?.position || pending
    snapshot = { ...next, position: current && current.revision > next.position.revision ? current : next.position }
    document.title = `${next.title} — ${translator(next.language)('audience')}`
    document.documentElement.lang = next.language
  }
  function action(command: PresentationAction) {
    if (desktop) void invoke('presentation_action', { id, action: command }).catch(cause => error = errorMessage(cause, snapshot?.language || 'en'))
    else channel?.postMessage({ kind: 'action', id, action: command })
  }
  function keyboard(event: KeyboardEvent) { const command = keyAction(event); if (command) { event.preventDefault(); action(command) } }
  onMount(() => {
    let disposed = false
    const cleanups: Array<() => void> = []
    document.documentElement.dataset.theme = 'dark'
    if (!desktop) {
      channel = new BroadcastChannel(`marpora.presentation.${id}`)
      channel.onmessage = ({ data }) => {
        if (data?.id !== id) return
        if (data.kind === 'snapshot') receive(data.snapshot)
        if (data.kind === 'position') position(data.position)
        if (data.kind === 'ended') ended = true
      }
      markReady = () => channel?.postMessage({ kind: 'ready', id })
      const hello = () => { if (!snapshot) channel?.postMessage({ kind: 'hello', id }) }
      hello(); const retry = setInterval(hello, 500)
      cleanups.push(() => clearInterval(retry), () => channel?.close())
    } else void (async () => {
      const { listen } = await import('@tauri-apps/api/event')
      const stop = await listen<{ id: string; position: SlidePosition }>('presentation-position', ({ payload }) => { if (payload.id === id) position(payload.position) })
      if (disposed) { stop(); return }
      cleanups.push(stop)
      const data = await invoke<AudienceSnapshot>('presentation_snapshot', { id })
      if (disposed) return
      markReady = () => { void invoke('presentation_ready', { id }).catch(cause => { error = errorMessage(cause, data.language) }) }
      receive(data)
    })().catch(cause => { if (!disposed) error = errorMessage(cause, 'en') })
    return () => { disposed = true; cleanups.forEach(cleanup => cleanup()) }
  })
</script>
<svelte:window onkeydown={keyboard}/>
<div class="audience-shell" data-testid="audience" data-slide={snapshot?.position.slide} data-step={snapshot?.position.step} data-revision={snapshot?.position.revision}>
  {#if error}<div class="audience-message" role="alert">{error}</div>
  {:else if ended}<div class="audience-message">{t('presentationEnded')}</div>
  {:else if snapshot}<div class="audience-slide" style:--deck-ratio={snapshot.deck.aspectRatio}><SlideSurface deck={snapshot.deck} slide={snapshot.position.slide} step={snapshot.position.step} title={t('audienceSlide')} onready={() => markReady()}/></div>
  {:else}<div class="audience-message" role="status">{t('preparingPresentation')}</div>{/if}
</div>
