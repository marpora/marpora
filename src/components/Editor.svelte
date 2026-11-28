<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState, StateEffect, Transaction, Compartment, type Extension } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands'
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
  import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language'
  import { tags } from '@lezer/highlight'
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
  import { translator, searchPhrases, type Language } from '../lib/i18n'
  import { EditorSessions } from '../lib/workspace'
  import { livePreview, liveFocus } from '../lib/live-preview'

  let { value, revision, documentId = 'default', sessions = new EditorSessions(), onedit, oncursor, onscroll, wrap = true, language = 'en', editing = 'live', path = null }: {
    value: string; revision: number; documentId?: string; sessions?: EditorSessions; onedit: (text: string) => void;
    oncursor: (line: number, column: number, offset: number) => void;
    onscroll: (progress: number) => void; wrap?: boolean;
    language?: Language;
    editing?: 'live' | 'source'; path?: string | null;
  } = $props()
  let host: HTMLDivElement
  let view: EditorView | undefined
  let editorExtensions: Extension[] = []
  let appliedRevision = -1
  let appliedId = ''
  const wrapping = new Compartment()
  const localization = new Compartment()
  const presentation = new Compartment()
  const highlights = HighlightStyle.define([
    { tag: tags.heading, fontWeight: '700', color: 'var(--color-ink)' },
    { tag: tags.strong, fontWeight: '700' }, { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: 'var(--color-accent)' }, { tag: tags.url, color: 'var(--color-muted)' },
    { tag: tags.comment, color: 'var(--syntax-comment)' }, { tag: tags.keyword, color: 'var(--syntax-keyword)' },
    { tag: tags.string, color: 'var(--syntax-string)' }, { tag: tags.number, color: 'var(--syntax-number)' },
    { tag: tags.meta, color: 'var(--syntax-comment)' },
  ])
  function localized() {
    const t = translator(language)
    return [placeholder(t('placeholder')), EditorState.phrases.of(language === 'zh' ? searchPhrases : {}), EditorView.contentAttributes.of({ 'aria-label': t('editor'), spellcheck: 'false', autocapitalize: 'off' })]
  }

  export function replaceSource(next: string): boolean {
    if (!view) return false
    const previous = view.state.doc.toString()
    if (previous === next) return true
    let from = 0, oldEnd = previous.length, newEnd = next.length
    while (from < oldEnd && from < newEnd && previous[from] === next[from]) from++
    while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd-- }
    view.dispatch({ changes: { from, to: oldEnd, insert: next.slice(from, newEnd) }, annotations: [Transaction.userEvent.of('input.theme'), isolateHistory.of('full')] })
    return true
  }
  export function focus() { view?.focus() }
  export function jumpTo(offset: number) {
    if (!view) return
    const pos = Math.min(offset, view.state.doc.length)
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    view.focus()
  }

  onMount(() => {
    editorExtensions = [
        history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(),
        markdown({ base: markdownLanguage }), syntaxHighlighting(highlights), highlightSelectionMatches(),
        presentation.of(editing === 'live' ? livePreview({ language, path }) : lineNumbers()),
        localization.of(localized()),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onedit(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) {
            const offset = update.state.selection.main.head
            const line = update.state.doc.lineAt(offset)
            oncursor(line.number, offset - line.from + 1, offset)
          }
        }),
        EditorView.domEventHandlers({ scroll: () => {
          const el = view!.scrollDOM
          onscroll(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight))
        } }),
      ]
    view = new EditorView({
      parent: host,
      state: sessions.get(documentId)?.state.doc.toString() === value ? sessions.get(documentId)!.state.update({ effects: StateEffect.reconfigure.of(editorExtensions) }).state : EditorState.create({ doc: value, extensions: editorExtensions }),
    })
    appliedRevision = revision
    appliedId = documentId
    const restored = sessions.get(documentId)
    if (restored) requestAnimationFrame(() => { if (view) { view.scrollDOM.scrollTop = restored.top; view.scrollDOM.scrollLeft = restored.left } })
    return () => {
      if (view) sessions.set(appliedId, { state: view.state, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft })
      view?.destroy()
    }
  })

  $effect(() => {
    const next = revision
    const text = value
    const id = documentId
    if (view && (id !== appliedId || next !== appliedRevision)) {
      sessions.set(appliedId, { state: view.state, top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft })
      const cached = sessions.get(id)
      view.setState(cached && cached.state.doc.toString() === text ? cached.state.update({ effects: StateEffect.reconfigure.of(editorExtensions) }).state : EditorState.create({ doc: text, extensions: editorExtensions }))
      appliedId = id
      appliedRevision = next
      view.dispatch({ effects: [wrapping.reconfigure(wrap ? EditorView.lineWrapping : []), localization.reconfigure(localized()), presentation.reconfigure(editing === 'live' ? livePreview({ language, path }) : lineNumbers())] })
      const currentView = view
      requestAnimationFrame(() => { if (appliedId === id) { currentView.scrollDOM.scrollTop = cached?.top || 0; currentView.scrollDOM.scrollLeft = cached?.left || 0 } })
      const position = view.state.selection.main.head
      const current = view.state.doc.lineAt(position)
      oncursor(current.number, position - current.from + 1, position)
    }
  })

  $effect(() => { view?.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) }) })
  $effect(() => { void language; view?.dispatch({ effects: localization.reconfigure(localized()) }) })
  $effect(() => {
    const next = editing === 'live' ? livePreview({ language, path }) : lineNumbers()
    if (view) {
      view.dispatch({ effects: [presentation.reconfigure(next), view.scrollSnapshot()] })
      if (editing === 'live') view.dispatch({ effects: liveFocus.of(view.hasFocus) })
    }
  })
</script>

<div class="editor-host" bind:this={host}></div>
