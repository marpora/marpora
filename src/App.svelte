<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import Logo from './components/Logo.svelte'
  import Editor from './components/Editor.svelte'
  import Preview from './components/Preview.svelte'
  import PdfPreview from './components/PdfPreview.svelte'
  import FolderTree from './components/FolderTree.svelte'
  import Tabs from './components/Tabs.svelte'
  import PreferencesPanel from './components/Preferences.svelte'
  import { translator, errorMessage } from './lib/i18n'
  import { loadPreferences, preferencesKey, resolveAppearance } from './lib/preferences'
  import { characterCount, effectiveMode, fileName, slideStarts } from './lib/document'
  import { desktop, loadTheme, openDocument, saveDocument, type OpenDocument } from './lib/files'
  import { openFolder, openFolderFile } from './lib/folders'
  import { newTab, tabForDocument, isDirty, EditorSessions, serializeDrafts, restoreDrafts, draftKey, type WorkspaceTab, type Folder } from './lib/workspace'
  import { renderPreview, importHtml, type RenderedPreview } from './lib/render'
  import { standaloneHtml, writeExport } from './lib/export'
  import { welcome, welcomeEnglish } from './lib/samples'

  const initialPreferences = loadPreferences()
  let preferences = $state(initialPreferences)
  let preferencesOpen = $state(false)
  let exportOpen = $state(false)
  let systemDark = $state(window.matchMedia('(prefers-color-scheme: dark)').matches)
  const t = $derived(translator(preferences.language))
  const scheme = $derived(resolveAppearance(preferences.appearance, systemDark))
  const initialTab = newTab(initialPreferences.language === 'zh' ? welcome : welcomeEnglish, translator(initialPreferences.language)('welcomeName'))
  let tabs = $state<WorkspaceTab[]>([initialTab])
  let activeId = $state(initialTab.id)
  const active = $derived(tabs.find(tab => tab.id === activeId) || tabs[0])
  const text = $derived(active.text), path = $derived(active.path), label = $derived(active.label)
  const layout = $derived(active.layout), editing = $derived(active.editing), mode = $derived(active.mode)
  const slide = $derived(active.slide), lineEnding = $derived(active.lineEnding), bom = $derived(active.bom)
  const sessions = new EditorSessions()
  let folder = $state<Folder | null>(null)
  let sidebar = $state(false)
  let folderRevision = $state(0)
  let line = $state(1), column = $state(1), offset = $state(0), progress = $state(0)
  let sync = $state(true), wrap = $state(true), step = $state(0), presenting = $state(false), showNotes = $state(false)
  let busy = $state(false), fileBusy = $state(false), exporting = $state(false), error = $state(''), recovered = $state(false)
  let exported = $state<string | null>(null)
  let result = $state<RenderedPreview>({ html: '', css: '', titles: [], notes: [], theme: 'Markdown' })
  let editor = $state<Editor>(), preview = $state<Preview>()
  let renderedMode = $state<'document' | 'slides'>('document')
  let split = $state(48), dragging = $state(false), initialized = $state(false)
  let workspace = $state<HTMLDivElement>()
  let renderGeneration = 0
  let renderedId = ''
  let closing = false
  const dirty = $derived(isDirty(active))
  const currentMode = $derived(active.kind === 'html' ? renderedMode : effectiveMode(text, mode))
  const characters = $derived(characterCount(text))
  const starts = $derived(slideStarts(text))
  const slideCount = $derived(result.titles.length)
  const notes = $derived(result.notes[slide]?.join('\n\n') || '')

  $effect(() => {
    const id = active.id, source = active.text, kind = active.kind, target = effectiveMode(source, active.mode), css = active.themeCss, language = preferences.language
    const generation = ++renderGeneration
    untrack(() => { if (renderedId !== id) { result = { html: '', css: '', titles: [], notes: [], theme: kind === 'html' ? 'HTML' : 'Markdown' }; renderedId = id } })
    if (kind === 'pdf') { busy = false; return }
    busy = true
    const timer = setTimeout(async () => {
      try {
        const rendered = kind === 'html' ? importHtml(source, language) : { result: await renderPreview(source, { mode: target, themeCss: css, language }), mode: target }
        if (generation !== renderGeneration || id !== activeId) return
        result = rendered.result; renderedMode = rendered.mode
        active.slide = Math.min(active.slide, Math.max(0, result.titles.length - 1)); step = 0
      } catch (cause) { if (generation === renderGeneration) error = t('previewFailed', { error: errorMessage(cause, language) }) }
      finally { if (generation === renderGeneration) busy = false }
    }, 180)
    return () => clearTimeout(timer)
  })
  $effect(() => {
    document.documentElement.lang = preferences.language === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset.theme = scheme; document.documentElement.dataset.accent = preferences.accent
    try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)) } catch { /* Optional storage. */ }
  })
  $effect(() => {
    const language = preferences.language, appearance = preferences.appearance
    if (desktop) {
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_language', { language }))
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTheme(appearance === 'system' ? null : appearance))
    }
  })
  $effect(() => {
    const title = `${dirty ? '• ' : ''}${label} — Marpora`
    document.title = title
    if (desktop) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
  })
  $effect(() => {
    if (!initialized) return
    const snapshot = serializeDrafts(tabs, activeId)
    const timer = setTimeout(() => { try { if (snapshot.tabs.length) localStorage.setItem(draftKey, JSON.stringify(snapshot)); else localStorage.removeItem(draftKey); localStorage.removeItem('marpora.draft.v1') } catch { /* Disk saving remains available. */ } }, 500)
    return () => clearTimeout(timer)
  })
  $effect(() => { sessions.retain(tabs.map(tab => tab.id)) })

  async function confirmDiscard(all = false): Promise<boolean> {
    if (!(all ? tabs.some(isDirty) : dirty)) return true
    const question = t(all ? 'discardAll' : 'discardQuestion')
    if (desktop) { const { ask } = await import('@tauri-apps/plugin-dialog'); return ask(question, { title: 'Marpora', kind: 'warning', okLabel: t('discard'), cancelLabel: t('keepEditing') }) }
    return window.confirm(question)
  }
  function activate(id: string) { activeId = id; step = 0; line = 1; column = 1; progress = 0; error = ''; exported = null }
  function add(opened: OpenDocument) {
    const existing = tabs.find(tab => tab.path === opened.path)
    if (existing) { activate(existing.id); return }
    const tab = tabForDocument(opened); tabs.push(tab); activate(tab.id)
  }
  function sample(_kind: 'empty') {
    if (fileBusy) return
    const tab = newTab('', t('untitled')); tabs.push(tab); activate(tab.id)
  }
  async function closeTab(id: string) {
    if (fileBusy) return
    const tab = tabs.find(tab => tab.id === id)
    if (!tab) return
    if (isDirty(tab)) {
      const question = t('discardQuestion')
      const discard = desktop ? await (await import('@tauri-apps/plugin-dialog')).ask(question, { title: tab.label, kind: 'warning', okLabel: t('discard'), cancelLabel: t('keepEditing') }) : window.confirm(question)
      if (!discard) return
    }
    const index = tabs.indexOf(tab)
    tabs = tabs.filter(tab => tab.id !== id)
    if (!tabs.length) tabs = [newTab('', t('untitled'))]
    if (activeId === id) activate(tabs[Math.min(index, tabs.length - 1)].id)
  }
  async function open() {
    if (fileBusy) return
    fileBusy = true
    try { const opened = await openDocument(preferences.language); if (opened) add(opened) }
    catch (cause) { error = t('openFailed', { error: errorMessage(cause, preferences.language) }) }
    finally { fileBusy = false }
  }
  async function chooseFolder() {
    if (fileBusy) return
    fileBusy = true
    try { const opened = await openFolder(); if (opened) { folder = opened; sidebar = true; folderRevision++ } }
    catch (cause) { error = t('openFailed', { error: errorMessage(cause, preferences.language) }) }
    finally { fileBusy = false }
  }
  async function openEntry(path: string) {
    if (!folder || fileBusy) return
    const existing = tabs.find(tab => tab.path === path)
    if (existing) { activate(existing.id); return }
    fileBusy = true
    try { add(await openFolderFile(folder.path, path)) }
    catch (cause) { error = t('openFailed', { error: errorMessage(cause, preferences.language) }) }
    finally { fileBusy = false }
  }
  async function save(as = false): Promise<boolean> {
    if (fileBusy || active.kind !== 'markdown') return false
    fileBusy = true
    const tab = active, snapshot = tab.text
    try {
      const nextPath = await saveDocument(as ? null : tab.path, snapshot, as || !tab.path ? null : tab.savedText, { lineEnding: tab.lineEnding, bom: tab.bom, suggestedName: tab.label })
      if (!nextPath) return false
      // A Save as must not create two independent editable buffers for one file.
      const duplicate = tabs.find(other => other.id !== tab.id && other.path === nextPath)
      if (duplicate) duplicate.path = null
      tab.path = nextPath; tab.label = fileName(nextPath); tab.savedText = snapshot
      recovered = false; error = ''; folderRevision++; return true
    } catch (cause) { error = t('saveFailed', { error: errorMessage(cause, preferences.language) }); return false }
    finally { fileBusy = false }
  }
  async function theme() {
    const tab = active
    try { const css = await loadTheme(preferences.language); if (css && !/@theme\s+([\w-]+)/.test(css)) { error = t('themeMetadata'); return }; if (css) tab.themeCss = css }
    catch (cause) { error = t('themeFailed', { error: errorMessage(cause, preferences.language) }) }
  }
  async function exportFile(format: 'html' | 'pdf') {
    if (exporting || active.kind === 'pdf') return
    exportOpen = false; exporting = true; error = ''; exported = null
    const tab = active, language = preferences.language
    try {
      const mode = effectiveMode(tab.text, tab.mode)
      const rendered = tab.kind === 'html' ? importHtml(tab.text, language) : { result: await renderPreview(tab.text, { mode, themeCss: tab.themeCss, language }), mode }
      if (rendered.result.warning) throw new Error(rendered.result.warning)
      const payload = await standaloneHtml(rendered.result, rendered.mode, tab.path, tab.label, language)
      exported = await writeExport(payload, format, tab.label)
    } catch (cause) { error = t('exportFailed', { error: errorMessage(cause, language) }) }
    finally { exporting = false }
  }
  async function previewExport() {
    if (!exported || !desktop) return
    try { const { invoke } = await import('@tauri-apps/api/core'); add(await invoke<OpenDocument>('read_document', { path: exported })) }
    catch (cause) { error = errorMessage(cause, preferences.language) }
  }
  function cursor(nextLine: number, nextColumn: number, nextOffset: number) {
    line = nextLine; column = nextColumn; offset = nextOffset
    if (currentMode === 'slides' && sync && active.kind === 'markdown') {
      const positions = result.positions?.length ? result.positions : starts
      const index = Math.max(0, positions.reduce((last, position, index) => position <= offset ? index : last, 0))
      const next = Math.min(index, Math.max(0, slideCount - 1))
      if (next !== slide) { active.slide = next; step = 0 }
    }
  }
  function go(index: number) { active.slide = Math.max(0, Math.min(index, slideCount - 1)); step = 0 }
  function next() { const max = preview?.fragmentCount() || 0; if (presenting && step < max) step++; else go(slide + 1) }
  function previous() { if (presenting && step > 0) step--; else go(slide - 1) }
  function togglePresentation() { presenting = !presenting; step = presenting ? 0 : Number.MAX_SAFE_INTEGER }
  function keyboard(event: KeyboardEvent, fromPreview = false) {
    if (event.isComposing) return
    if (event.key === 'Escape') { preferencesOpen = false; exportOpen = false }
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key === '/' && active.kind === 'markdown') { event.preventDefault(); active.editing = editing === 'live' ? 'source' : 'live'; if (layout === 'preview') active.layout = 'editor' }
    else if (mod && event.key.toLowerCase() === 'o') { event.preventDefault(); void (event.shiftKey ? chooseFolder() : open()) }
    else if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void save(event.shiftKey) }
    else if (mod && event.key.toLowerCase() === 'n') { event.preventDefault(); sample('empty') }
    else if (mod && event.key.toLowerCase() === 'w') { event.preventDefault(); void closeTab(activeId) }
    else if (event.ctrlKey && event.key === 'Tab') { event.preventDefault(); const index = tabs.findIndex(tab => tab.id === activeId); activate(tabs[(index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length].id) }
    else if (event.key === 'Escape' && presenting) { event.preventDefault(); presenting = false; step = Number.MAX_SAFE_INTEGER }
    else if ((presenting || (currentMode === 'slides' && (fromPreview || (event.target instanceof Element && !!event.target.closest('.preview-pane'))))) && !mod && !event.altKey && !event.shiftKey) {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); next() }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); previous() }
      if (event.key === 'Home') { event.preventDefault(); go(0) }
      if (event.key === 'End') { event.preventDefault(); go(slideCount - 1) }
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) { if (tabs.some(isDirty)) { event.preventDefault(); event.returnValue = '' } }
  function resize(event: PointerEvent) { if (!dragging) return; const rect = workspace!.getBoundingClientRect(); split = Math.max(25, Math.min(75, (event.clientX - rect.left) / rect.width * 100)) }
  onMount(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => { systemDark = media.matches }
    media.addEventListener('change', updateSystemTheme)
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || 'null')
      let drafts = restoreDrafts(stored)
      if (!drafts.length) { const old = JSON.parse(localStorage.getItem('marpora.draft.v1') || 'null'); if (old?.dirty && typeof old.text === 'string') drafts = restoreDrafts({ tabs: [old] }) }
      if (drafts.length) { tabs = drafts; activeId = drafts.find(tab => tab.id === stored?.activeId)?.id || drafts[0].id; recovered = true }
    } catch { /* Ignore damaged optional drafts. */ }
    initialized = true
    if (!desktop) return () => media.removeEventListener('change', updateSystemTheme)
    const cleanups: Array<() => void> = []; let disposed = false
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { listen } = await import('@tauri-apps/api/event')
      const close = await getCurrentWindow().onCloseRequested(async event => {
        if (!tabs.some(isDirty) || closing) return
        event.preventDefault()
        if (await confirmDiscard(true)) { closing = true; tabs.forEach(tab => tab.savedText = tab.text); try { localStorage.removeItem(draftKey) } catch { /* Optional storage. */ }; await getCurrentWindow().destroy() }
      })
      const menu = await listen<string>('menu-action', ({ payload }) => {
        if (payload === 'open') void open()
        if (payload === 'open-folder') void chooseFolder()
        if (payload === 'save') void save()
        if (payload === 'save-as') void save(true)
        if (payload === 'new') sample('empty')
        if (payload === 'close-tab') void closeTab(activeId)
        if (payload === 'export-html') void exportFile('html')
        if (payload === 'export-pdf') void exportFile('pdf')
        if (payload === 'quit') void getCurrentWindow().close()
      })
      const drop = await listen<OpenDocument>('document-dropped', ({ payload }) => add(payload))
      const folderDrop = await listen<Folder>('folder-dropped', ({ payload }) => { folder = payload; sidebar = true; folderRevision++ })
      const failure = await listen<string>('document-error', ({ payload }) => { error = errorMessage(payload, preferences.language) })
      if (disposed) [close, menu, drop, folderDrop, failure].forEach(fn => fn()); else cleanups.push(close, menu, drop, folderDrop, failure)
    })()
    return () => { disposed = true; cleanups.forEach(fn => fn()); media.removeEventListener('change', updateSystemTheme) }
  })
</script>

<svelte:window onpointerdown={(event) => { if (!(event.target as Element).closest('.preferences-anchor')) preferencesOpen = false; if (!(event.target as Element).closest('.export-anchor')) exportOpen = false }} onkeydown={keyboard} onbeforeunload={beforeUnload} onpointermove={resize} onpointerup={() => dragging = false} />

<div class="app-shell" class:presenting class:resizing={dragging}>
  <header class="toolbar">
    <div class="brand" aria-label="Marpora">
      <Logo/>
      <span>Marpora</span>
    </div>
    <div class="toolbar-divider"></div>
    <div class="file-actions">
      <button class="icon-button" aria-label={t('toggleSidebar')} title={t('toggleSidebar')} aria-pressed={sidebar} onclick={() => sidebar = !sidebar}><svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M8 4v12"/></svg></button>

      <button class="icon-button" title={`${t('new')} (⌘ / Ctrl + N)`} aria-label={t('newDocument')} disabled={fileBusy} onclick={() => sample('empty')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button>
      <button class="icon-button" aria-label={t('openFolder')} title={`${t('openFolder')} (⌘ / Ctrl + Shift + O)`} disabled={fileBusy} onclick={chooseFolder}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 6.5V4h5l2 2h8v10h-15V6.5Z M10 9v5m-2-3 2-2 2 2"/></svg></button>
      <button class="quiet-button" disabled={fileBusy} onclick={open} title="⌘ / Ctrl + O"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 6.5V4h5l2 2h8v10h-15V6.5Z"/></svg>{t('open')}</button>
      <button class="quiet-button" disabled={fileBusy || active.kind !== 'markdown'} onclick={() => save()} title="⌘ / Ctrl + S"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h10l3 3v11H3V3h1ZM6 3v5h7V3M6 17v-6h8v6"/></svg>{fileBusy ? t('processing') : t('save')}</button>
      <button class="icon-button save-as" title={`${t('saveAs')} (⌘ / Ctrl + Shift + S)`} aria-label={t('saveAs')} disabled={fileBusy || active.kind !== 'markdown'} onclick={() => save(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 12v5h12v-5"/></svg></button>
    </div>
    <div class="document-name" title={path || label}><span>{label}</span>{#if dirty}<span class="unsaved" aria-label={t('unsaved')}>{t('unsaved')}</span>{/if}</div>
    <div class="toolbar-end">
      <div class="preferences-anchor">
        <button class="icon-button" aria-label={t('preferences')} title={t('preferences')} aria-expanded={preferencesOpen} onclick={() => preferencesOpen = !preferencesOpen}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/></svg></button>
        {#if preferencesOpen}<PreferencesPanel value={preferences} onchange={(value) => preferences = value} onclose={() => preferencesOpen = false}/>{/if}
      </div>
      <div class="export-anchor"><button class="quiet-button" disabled={exporting || active.kind === 'pdf'} aria-expanded={exportOpen} onclick={() => exportOpen = !exportOpen}>{exporting ? t('exporting') : t('export')}</button>{#if exportOpen}<div class="export-menu"><button onclick={() => exportFile('html')}>{t('exportHtml')}</button><button onclick={() => exportFile('pdf')}>{t('exportPdf')}</button></div>{/if}</div>
      <div class="layout-controls" class:read-only={active.kind !== 'markdown'} aria-label={t('layout')}>
        <button class:active={layout === 'editor'} title={t('editorOnly')} aria-label={t('editorOnly')} aria-pressed={layout === 'editor'} onclick={() => active.layout = 'editor'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M6 7h8M6 10h5"/></svg></button>
        <button class:active={layout === 'split'} title={t('splitView')} aria-label={t('splitView')} aria-pressed={layout === 'split'} onclick={() => active.layout = 'split'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12"/></svg></button>
        <button class:active={layout === 'preview'} title={t('previewOnly')} aria-label={t('previewOnly')} aria-pressed={layout === 'preview'} onclick={() => active.layout = 'preview'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/></svg></button>
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

  {#if exported}<div class="notice" role="status"><span>{t('exported', { name: fileName(exported) })}</span>{#if desktop}<button onclick={previewExport}>{t('openExport')}</button>{/if}<button onclick={() => exported = null}>{t('close')}</button></div>{/if}
  <div class="content-shell">
    {#if sidebar}<aside class="folder-sidebar" aria-label={t('folder')}><div class="pane-heading"><button class="quiet-button" disabled={fileBusy} onclick={chooseFolder}>{t('openFolder')}</button>{#if folder}<button class="icon-button" aria-label={t('refreshFolder')} onclick={() => folderRevision++}>↻</button>{/if}</div>{#if folder}<div class="folder-root" title={folder.path}>{folder.name}</div><div class="folder-scroll">{#key `${folder.path}-${folderRevision}`}<FolderTree root={folder.path} path={folder.path} activePath={path} language={preferences.language} onopen={openEntry}/>{/key}</div>{:else}<div class="folder-empty">{t('openFolder')}</div>{/if}</aside>{/if}
    <div class="document-area">
      <Tabs {tabs} {activeId} language={preferences.language} disabled={fileBusy} onactivate={activate} onclose={closeTab}/>
      <div id="document-panel" class="document-panel" role="tabpanel" aria-label={label}>
      {#if active.kind === 'pdf' && active.data}<PdfPreview data={active.data} page={active.pdfPage} onpage={page => active.pdfPage = page} language={preferences.language}/>{:else}
  <div class="workspace" bind:this={workspace} class:editor-only={layout === 'editor'} class:preview-only={layout === 'preview' || active.kind !== 'markdown'} style:--split={`${split}%`}>
    <section class="editor-pane" aria-label={t('source')}>
      <div class="pane-heading">
        <div class="mode-switch editing-switch" aria-label={t('editor')}>
          <button class:active={editing === 'live'} aria-pressed={editing === 'live'} onclick={() => active.editing = 'live'}>{t('live')}</button>
          <button class:active={editing === 'source'} aria-pressed={editing === 'source'} title="⌘ / Ctrl + /" onclick={() => active.editing = 'source'}>{t('source')}</button>
        </div>
        <div class="pane-tools"><button class:enabled={wrap} aria-pressed={wrap} onclick={() => wrap = !wrap} title={t('toggleWrap')}>{t('wrap')}</button><span class="file-extension">.md</span></div>
      </div>
      <Editor bind:this={editor} documentId={active.id} {sessions} value={text} revision={0} {wrap} language={preferences.language} {editing} {path} onedit={(nextText) => active.text = nextText} oncursor={cursor} onscroll={(value) => progress = value}/>
    </section>

    <button class="splitter" aria-label={t('resize')} title={t('resizeHint')} onpointerdown={(event) => { dragging = true; event.currentTarget.setPointerCapture(event.pointerId) }} onkeydown={(event) => { if (event.key === 'ArrowLeft') split = Math.max(25, split - 2); if (event.key === 'ArrowRight') split = Math.min(75, split + 2) }}></button>

    <section class="preview-pane" aria-label={t('preview')} tabindex="-1" onpointerdown={event => {
      // Clicking the preview's non-interactive chrome must release editor focus.
      if (!(event.target as Element).closest('button,input,select,textarea,a')) event.currentTarget.focus({ preventScroll: true })
    }}>
      <div class="pane-heading preview-heading">
        {#if active.kind === 'markdown'}<div class="mode-switch" aria-label={t('previewMode')}>
          <button class:active={mode === 'auto'} aria-pressed={mode === 'auto'} onclick={() => active.mode = 'auto'}>{t('auto')}</button>
          <button class:active={mode === 'document'} aria-pressed={mode === 'document'} onclick={() => active.mode = 'document'}>{t('document')}</button>
          <button class:active={mode === 'slides'} aria-pressed={mode === 'slides'} onclick={() => active.mode = 'slides'}>{t('slides')}</button>
        </div>
        {:else}<span>{t('readOnly')} · HTML</span>{/if}
        <div class="pane-tools">
          {#if active.kind === 'markdown' && currentMode === 'slides'}<button onclick={theme} title={t('themeHint')}>{t('loadTheme')}</button>{/if}
          <span class="render-status" aria-live="polite">{busy ? t('rendering') : currentMode === 'slides' ? 'Marp' : t('realtime')}</span>
        </div>
      </div>

      <div class="preview-content">
        {#if currentMode === 'slides'}
          <div class="deck-heading"><span>{result.theme}</span><button class="quiet-button" onclick={togglePresentation} disabled={slideCount === 0}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z"/></svg>{t('present')}</button></div>
        {/if}
        <Preview bind:this={preview} {result} mode={renderedMode} {slide} step={presenting ? step : Number.MAX_SAFE_INTEGER} {path} {progress} {sync} onkey={event => keyboard(event, true)} language={preferences.language} {scheme} accent={preferences.accent}/>
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

      {/if}</div>
    </div>
  </div>
  <footer class="statusbar">
    <div><span>{active.kind === 'markdown' ? t('characters', { count: characters.toLocaleString(preferences.language) }) : t('readOnly')}</span><span class="cursor-position" class:read-only={active.kind !== 'markdown'}>{t('cursor', { line, column })}</span></div>
    <div class="statusbar-center">{presenting ? t('presentationHint') : currentMode === 'slides' ? t('slideCount', { count: slideCount }) : t('localWriting')}</div>
    <div><button class:enabled={sync} aria-pressed={sync} onclick={() => sync = !sync} title={currentMode === 'slides' ? t('syncSlides') : t('syncScroll')}>{sync ? t('syncOn') : t('syncOff')}</button><span>UTF-8{bom ? ' BOM' : ''}</span><span>{lineEnding.toUpperCase()}</span></div>
  </footer>
  {#if presenting}<button class="exit-presentation" onclick={togglePresentation}>{t('exitPresentation')} <kbd>Esc</kbd></button>{/if}
</div>
