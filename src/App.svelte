<script lang="ts">
  import { onMount } from 'svelte'
  import Editor from './components/Editor.svelte'
  import Preview from './components/Preview.svelte'
  import { characterCount, effectiveMode, fileName, slideStarts, type PreviewMode } from './lib/document'
  import { desktop, loadTheme, openDocument, saveDocument, type OpenDocument } from './lib/files'
  import { renderPreview, type RenderedPreview } from './lib/render'
  import { starterDeck, uic, welcome } from './lib/samples'

  let text = $state(welcome)
  let savedText = $state<string | null>(welcome)
  let path = $state<string | null>(null)
  let label = $state('开始写作.md')
  let revision = $state(0)
  let mode = $state<PreviewMode>('auto')
  let layout = $state<'split' | 'editor' | 'preview'>('split')
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
    const generation = ++renderGeneration
    busy = true
    const timer = setTimeout(async () => {
      try {
        const next = await renderPreview(source, { mode: target, themeCss: css })
        if (generation !== renderGeneration) return
        result = next
        renderedMode = target
        slide = Math.min(slide, Math.max(0, next.titles.length - 1))
        step = 0
        error = ''
      } catch (cause) {
        if (generation === renderGeneration) error = `预览未能更新：${String(cause)}`
      } finally { if (generation === renderGeneration) busy = false }
    }, 180)
    return () => clearTimeout(timer)
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
      return ask('当前文档有未保存的修改。要放弃修改吗？', { title: 'Marpora', kind: 'warning', okLabel: '放弃修改', cancelLabel: '继续编辑' })
    }
    return window.confirm('当前文档有未保存的修改。要放弃修改吗？')
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
    try { localStorage.removeItem('marpora.draft.v1') } catch { /* optional storage */ }
  }

  async function sample(kind: 'welcome' | 'slides' | 'uic' | 'empty') {
    if (fileBusy) return
    fileBusy = true
    try {
      if (!await confirmDiscard()) return
      const samples = { welcome, slides: starterDeck, uic, empty: '' }
      applyDocument(samples[kind], kind === 'uic' ? 'uic-example.md' : kind === 'slides' ? '演示文稿.md' : kind === 'empty' ? '未命名.md' : '开始写作.md')
    } finally { fileBusy = false }
  }

  async function open() {
    if (fileBusy) return
    fileBusy = true
    try {
      const opened = await openDocument()
      if (!opened || !await confirmDiscard()) return
      applyDocument(opened.text, fileName(opened.path), opened)
    } catch (cause) { error = `打开失败：${String(cause)}` }
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
    } catch (cause) { error = `保存失败：${String(cause)}`; return false }
    finally { fileBusy = false }
  }

  async function theme() {
    try {
      const css = await loadTheme()
      if (css && !/@theme\s+([\w-]+)/.test(css)) { error = '主题 CSS 需要包含 /* @theme 主题名 */。'; return }
      if (css) themeCss = css
    } catch (cause) { error = `加载主题失败：${String(cause)}` }
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
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'o') { event.preventDefault(); void open() }
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
    try {
      const draft = JSON.parse(localStorage.getItem('marpora.draft.v1') || 'null')
      if (draft && typeof draft.text === 'string' && draft.dirty) {
        text = draft.text
        savedText = null
        label = typeof draft.label === 'string' ? draft.label : '恢复的草稿.md'
        revision += 1
        recovered = true
      }
    } catch { /* Ignore a damaged optional draft. */ }
    initialized = true
    if (!desktop) return
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
      const failure = await listen<string>('document-error', ({ payload }) => { error = payload })
      if (disposed) [close, menu, drop, failure].forEach(fn => fn())
      else cleanups.push(close, menu, drop, failure)
    })()
    return () => { disposed = true; cleanups.forEach(fn => fn()) }
  })
</script>

<svelte:window onkeydown={keyboard} onbeforeunload={beforeUnload} onpointermove={resize} onpointerup={() => dragging = false} />

<div class="app-shell" class:presenting class:resizing={dragging}>
  <header class="toolbar">
    <div class="brand" aria-label="Marpora">
      <svg width="25" height="25" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 23V5h4l6 10 6-10h4v18M4 5l10 17L24 5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
      <span>Marpora</span>
    </div>
    <div class="toolbar-divider"></div>
    <div class="file-actions">
      <button class="icon-button" title="新建 (⌘ / Ctrl + N)" aria-label="新建文档" disabled={fileBusy} onclick={() => sample('empty')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button>
      <button class="quiet-button" disabled={fileBusy} onclick={open} title="⌘ / Ctrl + O"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 6.5V4h5l2 2h8v10h-15V6.5Z"/></svg>打开</button>
      <button class="quiet-button" disabled={fileBusy} onclick={() => save()} title="⌘ / Ctrl + S"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h10l3 3v11H3V3h1ZM6 3v5h7V3M6 17v-6h8v6"/></svg>{fileBusy ? '处理中…' : '保存'}</button>
      <button class="icon-button save-as" title="另存为 (⌘ / Ctrl + Shift + S)" aria-label="另存为" disabled={fileBusy} onclick={() => save(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 12v5h12v-5"/></svg></button>
    </div>
    <div class="document-name" title={path || label}><span>{label}</span>{#if dirty}<span class="unsaved" aria-label="未保存">未保存</span>{/if}</div>
    <div class="toolbar-end">
      <button class="quiet-button example-button" disabled={fileBusy} onclick={() => sample('uic')}>UIC 示例</button>
      <div class="layout-controls" aria-label="工作区布局">
        <button class:active={layout === 'editor'} title="仅编辑" aria-label="仅编辑" aria-pressed={layout === 'editor'} onclick={() => layout = 'editor'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M6 7h8M6 10h5"/></svg></button>
        <button class:active={layout === 'split'} title="编辑与预览" aria-label="编辑与预览" aria-pressed={layout === 'split'} onclick={() => layout = 'split'}><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12"/></svg></button>
        <button class:active={layout === 'preview'} title="仅预览" aria-label="仅预览" aria-pressed={layout === 'preview'} onclick={() => layout = 'preview'}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/></svg></button>
      </div>
    </div>
  </header>

  {#if recovered}
    <div class="notice" role="status">已恢复未保存的草稿。保存时请选择文件位置。<button onclick={() => recovered = false} aria-label="关闭草稿提示">关闭</button></div>
  {/if}
  {#if error}
    <div class="notice error" role="alert"><span>{error}</span><button onclick={() => error = ''} aria-label="关闭错误提示">关闭</button></div>
  {:else if result.warning}
    <div class="notice" role="status">{result.warning}</div>
  {/if}

  <div class="workspace" bind:this={workspace} class:editor-only={layout === 'editor'} class:preview-only={layout === 'preview'} style:--split={`${split}%`}>
    <section class="editor-pane" aria-label="源码">
      <div class="pane-heading">
        <span class="pane-label"><span class="source-mark" aria-hidden="true">#</span>Markdown</span>
        <div class="pane-tools"><button class:enabled={wrap} aria-pressed={wrap} onclick={() => wrap = !wrap} title="切换自动换行">自动换行</button><span class="file-extension">.md</span></div>
      </div>
      <Editor bind:this={editor} value={text} {revision} {wrap} onedit={(nextText) => text = nextText} oncursor={cursor} onscroll={(value) => progress = value}/>
    </section>

    <button class="splitter" aria-label="调整编辑区宽度" title="拖动调整宽度；方向键微调" onpointerdown={(event) => { dragging = true; event.currentTarget.setPointerCapture(event.pointerId) }} onkeydown={(event) => { if (event.key === 'ArrowLeft') split = Math.max(25, split - 2); if (event.key === 'ArrowRight') split = Math.min(75, split + 2) }}></button>

    <section class="preview-pane" aria-label="预览">
      <div class="pane-heading preview-heading">
        <div class="mode-switch" aria-label="预览模式">
          <button class:active={mode === 'auto'} aria-pressed={mode === 'auto'} onclick={() => mode = 'auto'}>自动</button>
          <button class:active={mode === 'document'} aria-pressed={mode === 'document'} onclick={() => mode = 'document'}>文档</button>
          <button class:active={mode === 'slides'} aria-pressed={mode === 'slides'} onclick={() => mode = 'slides'}>幻灯片</button>
        </div>
        <div class="pane-tools">
          {#if currentMode === 'slides'}<button onclick={theme} title="导入含 @theme 的 Marp CSS">加载主题</button>{/if}
          <span class="render-status" aria-live="polite">{busy ? '渲染中…' : currentMode === 'slides' ? 'Marp' : '实时预览'}</span>
        </div>
      </div>

      <div class="preview-content">
        {#if currentMode === 'slides'}
          <div class="deck-heading"><span>{result.theme}</span><button class="quiet-button" onclick={togglePresentation} disabled={slideCount === 0}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6V4Z"/></svg>演示</button></div>
        {/if}
        <Preview bind:this={preview} {result} mode={renderedMode} {slide} step={presenting ? step : Number.MAX_SAFE_INTEGER} {path} {progress} {sync} onkey={keyboard}/>
        {#if currentMode === 'slides'}
          <div class="slide-navigation">
            <button class="icon-button" aria-label="上一张幻灯片" onclick={previous} disabled={slide === 0 && step === 0}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5"/></svg></button>
            <span data-testid="slide-counter">{slideCount ? slide + 1 : 0}<span class="counter-separator">/</span>{slideCount}</span>
            <button class="icon-button" aria-label="下一张幻灯片" onclick={next} disabled={slide >= slideCount - 1 && (!presenting || step >= (preview?.fragmentCount() || 0))}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button>
            <button class="notes-toggle" class:enabled={showNotes} aria-pressed={showNotes} onclick={() => showNotes = !showNotes}>备注</button>
          </div>
          {#if showNotes}<div class="speaker-notes"><span>演讲者备注</span><p>{notes || '这一页没有备注。'}</p></div>{/if}
          <nav class="slide-strip" aria-label="幻灯片导航">
            {#each result.titles as title, index}<button class:current={slide === index} aria-current={slide === index ? 'page' : undefined} onclick={() => go(index)} title={title}><span class="slide-index">{String(index + 1).padStart(2, '0')}</span><span class="slide-title">{title}</span></button>{/each}
          </nav>
        {/if}
      </div>
    </section>
  </div>

  <footer class="statusbar">
    <div><span>{characters.toLocaleString()} 字符</span><span class="cursor-position">行 {line}，列 {column}</span></div>
    <div class="statusbar-center">{presenting ? '方向键翻页，空格逐步显示，Esc 退出' : currentMode === 'slides' ? `${slideCount} 张幻灯片` : '本地写作，自由呈现'}</div>
    <div><button class:enabled={sync} aria-pressed={sync} onclick={() => sync = !sync} title={currentMode === 'slides' ? '随编辑光标切换幻灯片' : '跟随源码滚动'}>{sync ? '同步已开' : '同步已关'}</button><span>UTF-8{bom ? ' BOM' : ''}</span><span>{lineEnding.toUpperCase()}</span></div>
  </footer>
  {#if presenting}<button class="exit-presentation" onclick={togglePresentation}>退出演示 <kbd>Esc</kbd></button>{/if}
</div>
