<script lang="ts">
  import { onMount } from 'svelte'
  import Editor from './components/Editor.svelte'
  import Preview from './components/Preview.svelte'
  import PreferencesPanel from './components/Preferences.svelte'
  import { translator, errorMessage } from './lib/i18n'
  import { loadPreferences, preferencesKey, resolveAppearance } from './lib/preferences'
  import { characterCount, effectiveMode, fileName, slideStarts, type PreviewMode } from './lib/document'
  import { desktop, loadTheme, openDocument, saveDocument, type OpenDocument } from './lib/files'
  import { renderPreview, type RenderedPreview } from './lib/render'
  import { starterDeck, uic, welcome, welcomeEnglish } from './lib/samples'

  const initialPreferences = loadPreferences()
  let preferences = $state(initialPreferences)
  let preferencesOpen = $state(false)
  let systemDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches)
  const t = $derived(translator(preferences.language))
  const scheme = $derived(resolveAppearance(preferences.appearance, systemDark))
  const initialDocument = initialPreferences.language === 'zh' ? welcome : welcomeEnglish
  let text = $state(initialDocument)
  let savedText = $state<string | null>(initialDocument)
  let path = $state<string | null>(null)
  let label = $state(translator(initialPreferences.language)('welcomeName'))
  let revision = $state(0)
  let mode = $state<PreviewMode>('auto')
  let layout = $state<'split' | 'editor' | 'preview'>('editor')
  let editing = $state<'live' | 'source'>('live')
  let line = $state(1)
  let column = $state(1)
  let offset = $state(0)
  let progress = $state(0)
  let sync = $state(true)
  let wrap = $state(true)
  let slide = $state(0)
  let step = $state(0)
  let presenting = $state(false)
  let showNotes = $state(false)
  let themeCss = $state('')
  let busy = $state(false)
  let fileBusy = $state(false)
  let error = $state('')
  let recovered = $state(false)
  let lineEnding = $state<'lf' | 'crlf'>('lf')
  let bom = $state(false)
  let result = $state<RenderedPreview>({ html: '', css: '', titles: [], notes: [], theme: 'Markdown' })
  let editor = $state<Editor>()
  let preview = $state<Preview>()
  let renderedMode = $state<'document' | 'slides'>('document')
  let split = $state(48)
  let dragging = $state(false)
  let workspace: HTMLDivElement
  let initialized = $state(false)
  let renderGeneration = 0
  let closing = false
  const dirty = $derived(text !== savedText)
  const currentMode = $derived(effectiveMode(text, mode))
  const characters = $derived(characterCount(text))
  const starts = $derived(slideStarts(text))
  const slideCount = $derived(result.titles.length)
  const notes = $derived(result.notes[slide]?.join('\n\n') || '')

  $effect(() => {
    const source = text
    const target = currentMode
    const css = themeCss
    const language = preferences.language
    const generation = ++renderGeneration
    busy = true
    const timer = setTimeout(async () => {
      try {
        const next = await renderPreview(source, { mode: target, themeCss: css, language })
        if (generation !== renderGeneration) return
        result = next
        renderedMode = target
        slide = Math.min(slide, Math.max(0, next.titles.length - 1))
        step = 0
        error = ''
      } catch (cause) {
        if (generation === renderGeneration) error = t('previewFailed', { error: errorMessage(cause, preferences.language) })
      } finally { if (generation === renderGeneration) busy = false }
    }, 180)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    document.documentElement.lang = preferences.language === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset.theme = scheme
    document.documentElement.dataset.accent = preferences.accent
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)) } catch { /* Optional preference storage. */ }
  })

  $effect(() => {
    const language = preferences.language
    const appearance = preferences.appearance
    if (desktop) {
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_language', { language }))
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTheme(appearance === 'system' ? null : appearance))
    }
  })

  $effect(() => {
    document.title = `${dirty ? '• ' : ''}${label} — Marpora`
    if (desktop) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(`${dirty ? '• ' : ''}${label} — Marpora`))
    }
  })

  $effect(() => {
    if (!initialized) return
    const snapshot = { text, label, dirty }
    const timer = setTimeout(() => {
      try {
        if (snapshot.dirty) localStorage.setItem('marpora.draft.v1', JSON.stringify(snapshot))
        else localStorage.removeItem('marpora.draft.v1')
      } catch { /* Saving to disk remains available if draft storage is full. */ }
    }, 500)
    return () => clearTimeout(timer)
  })

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true
    if (desktop) {
      const { ask } = await import('@tauri-apps/plugin-dialog')
      return ask(t('discardQuestion'), { title: 'Marpora', kind: 'warning', okLabel: t('discard'), cancelLabel: t('keepEditing') })
    }
    return window.confirm(t('discardQuestion'))
  }

  function applyDocument(source: string, name: string, opened?: OpenDocument) {
    text = source
    savedText = source
    path = opened?.path || null
    label = name
    lineEnding = opened?.lineEnding || 'lf'
    bom = opened?.bom || false
    revision += 1
    slide = 0
    step = 0
    line = 1
    column = 1
    offset = 0
    progress = 0
    recovered = false
    error = ''
    mode = 'auto'
    layout = effectiveMode(source, 'auto') === 'slides' ? 'split' : 'editor'
    try { localStorage.removeItem('marpora.draft.v1') } catch { /* optional storage */ }
  }

  async function sample(kind: 'welcome' | 'slides' | 'uic' | 'empty') {
    if (fileBusy) return
    fileBusy = true
    try {
      if (!await confirmDiscard()) return
      const samples = { welcome: preferences.language === 'zh' ? welcome : welcomeEnglish, slides: starterDeck, uic, empty: '' }
      applyDocument(samples[kind], kind === 'uic' ? 'uic-example.md' : kind === 'slides' ? t('deckName') : kind === 'empty' ? t('untitled') : t('welcomeName'))
    } finally { fileBusy = false }
  }

  async function open() {
    if (fileBusy) return
    fileBusy = true
    try {
      const opened = await openDocument(preferences.language)
      if (!opened || !await confirmDiscard()) return
      applyDocument(opened.text, fileName(opened.path), opened)
    } catch (cause) { error = t('openFailed', { error: errorMessage(cause, preferences.language) }) }
    finally { fileBusy = false }
  }

  async function save(as = false): Promise<boolean> {
    if (fileBusy) return false
    fileBusy = true
    const snapshot = text
    try {
      const nextPath = await saveDocument(as ? null : path, snapshot, as || !path ? null : savedText, { lineEnding, bom, suggestedName: label })
      if (!nextPath) return false
      path = nextPath
      label = fileName(nextPath)
      savedText = snapshot
      recovered = false
      error = ''
      return true
    } catch (cause) { error = t('saveFailed', { error: errorMessage(cause, preferences.language) }); return false }
    finally { fileBusy = false }
  }

  async function theme() {
    try {
      const css = await loadTheme(preferences.language)
      if (css && !/@theme\s+([\w-]+)/.test(css)) { error = t('themeMetadata'); return }
      if (css) themeCss = css
    } catch (cause) { error = t('themeFailed', { error: errorMessage(cause, preferences.language) }) }
  }

  function cursor(nextLine: number, nextColumn: number, nextOffset: number) {
    line = nextLine
    column = nextColumn
    offset = nextOffset
    if (currentMode === 'slides' && sync) {
      const positions = result.positions?.length ? result.positions : starts
      const index = Math.max(0, positions.reduce((last, position, index) => position <= offset ? index : last, 0))
      const next = Math.min(index, Math.max(0, slideCount - 1))
      if (next !== slide) { slide = next; step = 0 }
    }
  }

  function go(index: number) {
    slide = Math.max(0, Math.min(index, slideCount - 1))
    step = 0
  }

  function next() {
    const max = preview?.fragmentCount() || 0
    if (presenting && step < max) step += 1
    else go(slide + 1)
  }

  function previous() {
    if (presenting && step > 0) step -= 1
    else go(slide - 1)
  }

  function togglePresentation() {
    presenting = !presenting
    step = presenting ? 0 : Number.MAX_SAFE_INTEGER
  }

  function keyboard(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'Escape') preferencesOpen = false
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key === '/') { event.preventDefault(); editing = editing === 'live' ? 'source' : 'live'; if (layout === 'preview') layout = 'editor' }
    else if (mod && event.key.toLowerCase() === 'o') { event.preventDefault(); void open() }
    else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void save(event.shiftKey) }
    else if (mod && event.key.toLowerCase() === 'n') { event.preventDefault(); void sample('empty') }
    else if (event.key === 'Escape' && presenting) { event.preventDefault(); presenting = false; step = Number.MAX_SAFE_INTEGER }
    else if (presenting && !mod && !event.altKey) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); next() }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); previous() }
      if (event.key === 'Home') { event.preventDefault(); go(0) }
      if (event.key === 'End') { event.preventDefault(); go(slideCount - 1) }
    }
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty) { event.preventDefault(); event.returnValue = '' }
  }

  function resize(event: PointerEvent) {
    if (!dragging) return
    const rect = workspace.getBoundingClientRect()
    split = Math.max(25, Math.min(75, (event.clientX - rect.left) / rect.width * 100))
  }

  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => { systemDark = media.matches }
    media.addEventListener('change', updateSystemTheme)
    try {
      const draft = JSON.parse(localStorage.getItem('marpora.draft.v1') || 'null')
      if (draft && typeof draft.text === 'string' && draft.dirty) {
        text = draft.text
        savedText = null
        label = typeof draft.label === 'string' ? draft.label : t('recoveredName')
        revision += 1
        recovered = true
      }
    } catch { /* Ignore a damaged optional draft. */ }
    initialized = true
    if (!desktop) return () => media.removeEventListener('change', updateSystemTheme)
    const cleanups: Array<() => void> = []
    let disposed = false
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { listen } = await import('@tauri-apps/api/event')
      const close = await getCurrentWindow().onCloseRequested(async (event) => {
        if (!dirty || closing) return
        event.preventDefault()
        if (await confirmDiscard()) {
          closing = true
          savedText = text
          try { localStorage.removeItem('marpora.draft.v1') } catch { /* optional storage */ }
          await getCurrentWindow().destroy()
        }
      })
      const menu = await listen<string>('menu-action', ({ payload }) => {
        if (payload === 'open') void open()
        if (payload === 'save') void save()
        if (payload === 'save-as') void save(true)
        if (payload === 'new') void sample('empty')
        if (payload === 'quit') void getCurrentWindow().close()
      })
      const drop = await listen<OpenDocument>('document-dropped', async ({ payload }) => {
        if (!fileBusy && await confirmDiscard()) applyDocument(payload.text, fileName(payload.path), payload)
      })
      const failure = await listen<string>('document-error', ({ payload }) => { error = errorMessage(payload, preferences.language) })
      if (disposed) [close, menu, drop, failure].forEach(fn => fn())
      else cleanups.push(close, menu, drop, failure)
    })()
    return () => { disposed = true; cleanups.forEach(fn => fn()); media.removeEventListener('change', updateSystemTheme) }
  })
</script>

<svelte:window onpointerdown={(event) => { if (!(event.target as Element).closest('.preferences-anchor')) preferencesOpen = false }} onkeydown={keyboard} onbeforeunload={beforeUnload} onpointermove={resize} onpointerup={() => dragging = false} />

<div class="app-shell" class:presenting class:resizing={dragging}>
  <header class="toolbar">
    <div class="brand" aria-label="Marpora">
      <svg width="25" height="25" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 23V5h4l6 10 6-10h4v18M4 5l10 17L24 5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      <span>Marpora</span>
    </div>
    <div class="toolbar-divider"></div>
    <div class="file-actions">
      <button class="icon-button" title={`${t('new')} (⌘ / Ctrl + N)`} aria-label={t('newDocument')} disabled={fileBusy} onclick={() => sample('empty')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button>
      <button class="quiet-button" disabled={fileBusy} onclick={open} title="⌘ / Ctrl + O"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 6.5V4h5l2 2h8v10h-15V6.5Z"/></svg>{t('open')}</button>
      <button class="quiet-button" disabled={fileBusy} onclick={() => save()} title="⌘ / Ctrl + S"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h10l3 3v11H3V3h1ZM6 3v5h7V3M6 17v-6h8v6"/></svg>{fileBusy ? t('processing') : t('save')}</button>
      <button class="icon-button save-as" title={`${t('saveAs')} (⌘ / Ctrl + Shift + S)`} aria-label={t('saveAs')} disabled={fileBusy} onclick={() => save(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 12v5h12v-5"/></svg></button>
    </div>
    <div class="document-name" title={path || label}><span>{label}</span>{#if dirty}<span class="unsaved" aria-label={t('unsaved')}>{t('unsaved')}</span>{/if}</div>
    <div class="toolbar-end">
      <div class="preferences-anchor">
        <button class="icon-button" aria-label={t('preferences')} title={t('preferences')} aria-expanded={preferencesOpen} onclick={() => preferencesOpen = !preferencesOpen}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/></svg></button>
        {#if preferencesOpen}<PreferencesPanel value={preferences} onchange={(value) => preferences = value} onclose={() => preferencesOpen = false}/>{/if}
      </div>
      <button class="quiet-button example-button" disabled={fileBusy} onclick={() => sample('uic')}>{t('uicExample')}</button>
      <div class="layout-controls" aria-label={t('layout')}>
        <button class:active={layout === 'editor'} title={t('editorOnly')} aria-label={t('editorOnly')} aria-pressed={layout === 'editor'} onclick={() => layout = 'editor'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M6 7h8M6 10h5"/></svg></button>
        <button class:active={layout === 'split'} title={t('splitView')} aria-label={t('splitView')} aria-pressed={layout === 'split'} onclick={() => layout = 'split'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12"/></svg></button>
        <button class:active={layout === 'preview'} title={t('previewOnly')} aria-label={t('previewOnly')} aria-pressed={layout === 'preview'} onclick={() => layout = 'preview'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/></svg></button>
      </div>
    </div>
  </header>

  {#if recovered}
    <div class="notice" role="status">{t('restored')}<button onclick={() => recovered = false} aria-label={t('closeDraft')}>{t('close')}</button></div>
  {/if}
  {#if error}
    <div class="notice error" role="alert"><span>{error}</span><button onclick={() => error = ''} aria-label={t('closeError')}>{t('close')}</button></div>
  {:else if result.warning}
    <div class="notice" role="status">{result.warning}</div>
  {/if}

  <div class="workspace" bind:this={workspace} class:editor-only={layout === 'editor'} class:preview-only={layout === 'preview'} style:--split={`${split}%`}>
    <section class="editor-pane" aria-label={t('source')}>
      <div class="pane-heading">
        <div class="mode-switch editing-switch" aria-label={t('editor')}>
          <button class:active={editing === 'live'} aria-pressed={editing === 'live'} onclick={() => editing = 'live'}>{t('live')}</button>
          <button class:active={editing === 'source'} aria-pressed={editing === 'source'} title="⌘ / Ctrl + /" onclick={() => editing = 'source'}>{t('source')}</button>
        </div>
        <div class="pane-tools"><button class:enabled={wrap} aria-pressed={wrap} onclick={() => wrap = !wrap} title={t('toggleWrap')}>{t('wrap')}</button><span class="file-extension">.md</span></div>
      </div>
      <Editor bind:this={editor} value={text} {revision} {wrap} language={preferences.language} {editing} {path} onedit={(nextText) => text = nextText} oncursor={cursor} onscroll={(value) => progress = value}/>
    </section>

    <button class="splitter" aria-label={t('resize')} title={t('resizeHint')} onpointerdown={(event) => { dragging = true; event.currentTarget.setPointerCapture(event.pointerId) }} onkeydown={(event) => { if (event.key === 'ArrowLeft') split = Math.max(25, split - 2); if (event.key === 'ArrowRight') split = Math.min(75, split + 2) }}></button>

    <section class="preview-pane" aria-label={t('preview')}>
      <div class="pane-heading preview-heading">
        <div class="mode-switch" aria-label={t('previewMode')}>
          <button class:active={mode === 'auto'} aria-pressed={mode === 'auto'} onclick={() => mode = 'auto'}>{t('auto')}</button>
          <button class:active={mode === 'document'} aria-pressed={mode === 'document'} onclick={() => mode = 'document'}>{t('document')}</button>
          <button class:active={mode === 'slides'} aria-pressed={mode === 'slides'} onclick={() => mode = 'slides'}>{t('slides')}</button>
        </div>
        <div class="pane-tools">
          {#if currentMode === 'slides'}<button onclick={theme} title={t('themeHint')}>{t('loadTheme')}</button>{/if}
          <span class="render-status" aria-live="polite">{busy ? t('rendering') : currentMode === 'slides' ? 'Marp' : t('realtime')}</span>
        </div>
      </div>

      <div class="preview-content">
        {#if currentMode === 'slides'}
          <div class="deck-heading"><span>{result.theme}</span><button class="quiet-button" onclick={togglePresentation} disabled={slideCount === 0}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z"/></svg>{t('present')}</button></div>
        {/if}
        <Preview bind:this={preview} {result} mode={renderedMode} {slide} step={presenting ? step : Number.MAX_SAFE_INTEGER} {path} {progress} {sync} onkey={keyboard} language={preferences.language} {scheme} accent={preferences.accent}/>
        {#if currentMode === 'slides'}
          <div class="slide-navigation">
            <button class="icon-button" aria-label={t('previousSlide')} onclick={previous} disabled={slide === 0 && step === 0}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5"/></svg></button>
            <span data-testid="slide-counter">{slideCount ? slide + 1 : 0}<span class="counter-separator">/</span>{slideCount}</span>
            <button class="icon-button" aria-label={t('nextSlide')} onclick={next} disabled={slide >= slideCount - 1 && (!presenting || step >= (preview?.fragmentCount() || 0))}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button>
            <button class="notes-toggle" class:enabled={showNotes} aria-pressed={showNotes} onclick={() => showNotes = !showNotes}>{t('notes')}</button>
          </div>
          {#if showNotes}<div class="speaker-notes"><span>{t('speakerNotes')}</span><p>{notes || t('noNotes')}</p></div>{/if}
          <nav class="slide-strip" aria-label={t('slideNavigation')}>
            {#each result.titles as title, index}<button class:current={slide === index} aria-current={slide === index ? 'page' : undefined} onclick={() => go(index)} title={title}><span class="slide-index">{String(index + 1).padStart(2, '0')}</span><span class="slide-title">{title}</span></button>{/each}
          </nav>
        {/if}
      </div>
    </section>
  </div>

  <footer class="statusbar">
    <div><span>{t('characters', { count: characters.toLocaleString(preferences.language) })}</span><span class="cursor-position">{t('cursor', { line, column })}</span></div>
    <div class="statusbar-center">{presenting ? t('presentationHint') : currentMode === 'slides' ? t('slideCount', { count: slideCount }) : t('localWriting')}</div>
    <div><button class:enabled={sync} aria-pressed={sync} onclick={() => sync = !sync} title={currentMode === 'slides' ? t('syncSlides') : t('syncScroll')}>{sync ? t('syncOn') : t('syncOff')}</button><span>UTF-8{bom ? ' BOM' : ''}</span><span>{lineEnding.toUpperCase()}</span></div>
  </footer>
  {#if presenting}<button class="exit-presentation" onclick={togglePresentation}>{t('exitPresentation')} <kbd>Esc</kbd></button>{/if}
</div>
