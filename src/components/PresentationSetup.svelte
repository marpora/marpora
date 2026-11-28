<script lang="ts">
  import { onMount } from 'svelte'
  import { presentationDisplays } from '../lib/presentation-host'
  import { desktop } from '../lib/files'
  import type { Display } from '../lib/presentation'
  import { translator, errorMessage, type Language } from '../lib/i18n'
  let { language, starting, onstart, onclose }: { language: Language; starting: boolean; onstart: (monitor: string | null) => void; onclose: () => void } = $props()
  let displays = $state<Display[]>([]), selected = $state(''), error = $state(''), loading = $state(true)
  const t = $derived(translator(language))
  let dialog: HTMLElement
  function trap(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const targets = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)'))
    const first = targets[0], last = targets.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  onMount(() => {
    dialog.focus()
    void presentationDisplays().then(value => { displays = value; selected = value.find(display => !display.current)?.id || '' }).catch(cause => error = errorMessage(cause, language)).finally(() => loading = false)
  })
</script>
<div class="presentation-dialog-backdrop">
  <div class="presentation-dialog" bind:this={dialog} tabindex="-1" onkeydown={trap} role="dialog" aria-modal="true" aria-labelledby="presentation-setup-title">
    <h2 id="presentation-setup-title">{t('presenterView')}</h2>
    <p>{t('presenterSetupHint')}</p>
    <label for="audience-display">{t('audienceDisplay')}</label>
    <select id="audience-display" bind:value={selected} disabled={starting || loading}>
      <option value="">{t('windowedRehearsal')}</option>
      {#each displays as display}<option value={display.id}>{display.name} · {Math.round(display.width / display.scaleFactor)} × {Math.round(display.height / display.scaleFactor)}{display.current ? ` · ${t('currentDisplay')}` : ''}</option>{/each}
    </select>
    {#if loading}<p role="status">{t('loading')}</p>{:else if !desktop}<p>{t('browserRehearsalHint')}</p>{:else if displays.length < 2}<p>{t('singleDisplayHint')}</p>{/if}
    {#if selected}<p>{t('fullscreenAudienceHint')}</p>{/if}
    {#if error}<p class="presentation-error" role="alert">{error}</p>{/if}
    <div class="presentation-dialog-actions"><button class="quiet-button" onclick={onclose}>{t('cancel')}</button><button class="presentation-primary" disabled={loading || starting || !!error} onclick={() => onstart(selected || null)}>{starting ? t('preparingPresentation') : t('startPresentation')}</button></div>
  </div>
</div>
