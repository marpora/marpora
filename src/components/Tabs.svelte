<script lang="ts">
  import { isDirty, type WorkspaceTab } from '../lib/workspace'
  import { translator, type Language } from '../lib/i18n'
  let { tabs, activeId, language, disabled, onactivate, onclose }: { tabs: WorkspaceTab[]; activeId: string; language: Language; disabled: boolean; onactivate: (id: string) => void; onclose: (id: string) => void } = $props()
  const t = $derived(translator(language))
  function navigate(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const tab = tabs[(index + step + tabs.length) % tabs.length]
    onactivate(tab.id)
    document.getElementById(`tab-${tab.id}`)?.focus()
  }
</script>

<div class="tab-strip" role="tablist" aria-label={t('openTabs')}>
  {#each tabs as tab, index (tab.id)}
    <div class="document-tab" class:active={tab.id === activeId}>
      <button class="tab-select" role="tab" id={`tab-${tab.id}`} aria-selected={tab.id === activeId} aria-controls="document-panel" tabindex={tab.id === activeId ? 0 : -1} title={tab.path || tab.label} {disabled} onclick={() => onactivate(tab.id)} onkeydown={(event) => navigate(event, index)}><span>{tab.label}{isDirty(tab) ? ' *' : ''}</span>{#if tab.kind !== 'markdown'}<span class="tab-kind">{tab.kind.toUpperCase()}</span>{/if}</button>
      <button class="tab-close" aria-label={t('closeTab', { name: tab.label })} title={t('closeTab', { name: tab.label })} {disabled} onclick={() => onclose(tab.id)}>×</button>
    </div>
  {/each}
</div>
