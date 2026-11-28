<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { translator, errorMessage, type Language } from '../lib/i18n'
  import { builtins, coverFor, isBuiltin } from '../lib/template-library'
  import type { ThemeCategory, ThemePack } from '../lib/theme-pack'
  import { renderPreview } from '../lib/render'
  import { preparePresentation, type AudienceDeck } from '../lib/presentation'
  import { saveThemePack } from '../lib/files'
  import SlideSurface from './SlideSurface.svelte'
  let { language, packs, initialId = builtins[0].id, canApply, oncreate, onapply, onimport, onclose }: { language: Language; packs: ThemePack[]; initialId?: string; canApply: boolean; oncreate: (pack: ThemePack) => void; onapply: (pack: ThemePack) => void; onimport: () => Promise<ThemePack | null>; onclose: () => void } = $props()
  const t = $derived(translator(language))
  const categories = ['showcase', 'teaching', 'academic', 'business', 'custom'] as const
  let selectedId = $state(untrack(() => initialId)), query = $state(''), category = $state<ThemeCategory | ''>('')
  let deck = $state<AudienceDeck | null>(null), slide = $state(0), loading = $state(true), working = $state(false), error = $state(''), notice = $state('')
  let dialog = $state<HTMLDivElement>(), generation = 0
  const selected = $derived(packs.find(pack => pack.id === selectedId) || packs[0])
  const visible = $derived(packs.filter(pack => (!category || pack.category === category) && `${pack.name.en} ${pack.name.zh} ${pack.description.en} ${pack.description.zh} ${pack.author}`.toLowerCase().includes(query.toLowerCase())))
  onMount(() => { dialog?.querySelector<HTMLButtonElement>('button')?.focus() })
  $effect(() => {
    const pack = selected, lang = language, next = ++generation
    loading = true; deck = null; slide = 0; error = ''
    void renderPreview(pack.starter, { mode: 'slides', themeCss: pack.css, language: lang }).then(result => preparePresentation(result, null)).then(value => { if (next === generation) deck = value }).catch(cause => { if (next === generation) error = errorMessage(cause, lang) }).finally(() => { if (next === generation) loading = false })
    return () => { generation++ }
  })
  async function importFile() {
    if (working) return
    working = true; error = ''; notice = ''
    try { const pack = await onimport(); if (pack) { selectedId = pack.id; category = ''; query = ''; notice = t('themePackImported', { name: pack.name[language] }) } }
    catch (cause) { error = errorMessage(cause, language) }
    finally { working = false }
  }
  async function download() {
    working = true; error = ''; notice = ''
    try { if (await saveThemePack(selected, JSON.stringify(selected, null, 2) + '\n')) notice = t('themePackDownloaded') }
    catch (cause) { error = errorMessage(cause, language) }
    finally { working = false }
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!working) onclose() }
    if (event.key !== 'Tab') return
    const targets = Array.from(dialog!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]'))
    const first = targets[0], last = targets.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
</script>
<div class="template-backdrop">
  <div class="template-library" role="dialog" aria-modal="true" aria-labelledby="template-library-title" bind:this={dialog} tabindex="-1" onkeydown={keyboard}>
    <header class="template-library-header"><div><h2 id="template-library-title">{t('templateLibrary')}</h2><p>{t('templateLibraryHint')}</p></div><button type="button" class="quiet-button" onclick={importFile} disabled={working} aria-busy={working}>{t('importThemePack')}</button><button type="button" class="icon-button" onclick={onclose} disabled={working} aria-label={t('close')}>×</button></header>
    {#if error}<div class="template-notice template-error" role="alert">{error}</div>{:else if notice}<div class="template-notice" role="status">{notice}</div>{/if}
    <div class="template-library-body">
      <aside class="template-browser" aria-label={t('templates')}><div class="template-filters"><label for="template-search">{t('templateSearch')}</label><input id="template-search" type="search" bind:value={query} autocomplete="off"/><label class="visually-hidden" for="template-category">{t('templateCategory')}</label><select id="template-category" bind:value={category}><option value="">{t('allTemplates')}</option>{#each categories as item}<option value={item}>{t(item)}</option>{/each}</select></div>
        <div class="template-list">{#each visible as pack}<button type="button" class="template-choice" class:current={pack.id === selected.id} aria-pressed={pack.id === selected.id} aria-label={pack.name[language]} onclick={() => selectedId = pack.id}>
          {#if coverFor(pack)}<img src={coverFor(pack)} alt="" width="640" height="360"/>{:else}<div class="template-cover-placeholder" aria-hidden="true"><span>{pack.name[language]}</span><span>{t(pack.category)}</span></div>{/if}
          <span class="template-choice-title">{pack.name[language]}<span>{t(pack.category)}</span></span>
        </button>{:else}<p class="template-empty">{t('noTemplates')}</p>{/each}</div>
      </aside>
      <section class="template-detail" aria-labelledby="template-name"><div class="template-detail-heading"><div><h3 id="template-name">{selected.name[language]}</h3><p>{selected.description[language]}</p></div><span>{isBuiltin(selected) ? t('templateOffline') : selected.author}</span></div>
        <div class="template-stage" data-testid="template-stage">{#if loading}<div class="template-loading" role="status">{t('rendering')}</div>{:else if deck}<SlideSurface {deck} {slide} title={t('templatePreview')}/>{/if}</div>
        <div class="template-pagination"><button type="button" aria-label={t('previousSlide')} disabled={!deck || slide === 0} onclick={() => slide--}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5"/></svg></button><span data-testid="template-counter">{deck ? slide + 1 : 0} / {deck?.titles.length || 0}</span><span class="template-page-title">{deck?.titles[slide] || ''}</span><button type="button" aria-label={t('nextSlide')} disabled={!deck || slide >= deck.titles.length - 1} onclick={() => slide++}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button></div>
        <dl class="template-metadata"><div><dt>{t('templateVersion')}</dt><dd>{selected.version}</dd></div><div><dt>{t('templateAuthor')}</dt><dd>{selected.author}</dd></div><div><dt>{t('templateLicense')}</dt><dd>{selected.license}</dd></div></dl>
        <div class="template-library-actions"><div><button type="button" class="quiet-button" onclick={download} disabled={working || loading || !deck}>{t('downloadThemePack')}</button><p>{t('applyThemeHint')}</p></div><button type="button" class="quiet-button" disabled={!canApply || working || loading || !deck} onclick={() => onapply(selected)}>{t('applyTheme')}</button><button type="button" class="template-primary" disabled={working || loading || !deck} onclick={() => oncreate(selected)}>{t('createDeck')}</button></div>
      </section>
    </div>
  </div>
</div>
