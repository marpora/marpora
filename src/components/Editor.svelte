<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState, Compartment, type Extension } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
  import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language'
  import { tags } from '@lezer/highlight'
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
  import { translator, searchPhrases, type Language } from '../lib/i18n'
  import { livePreview, liveFocus } from '../lib/live-preview'

  let { value, revision, onedit, oncursor, onscroll, wrap = true, language = 'en', editing = 'live', path = null }: {
    value: string; revision: number; onedit: (text: string) => void;
    oncursor: (line: number, column: number, offset: number) => void;
    onscroll: (progress: number) => void; wrap?: boolean;
    language?: Language;
    editing?: 'live' | 'source'; path?: string | null;
  } = $props()
  let host: HTMLDivElement
  let view: EditorView | undefined
  let editorExtensions: Extension[] = []
  let appliedRevision = -1
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
      state: EditorState.create({ doc: value, extensions: editorExtensions }),
    })
    appliedRevision = revision
    return () => view?.destroy()
  })

  $effect(() => {
    const next = revision
    const text = value
    if (view && next !== appliedRevision) {
      // A new document gets independent undo history; typing never resets it.
      view.setState(EditorState.create({ doc: text, extensions: editorExtensions }))
      view.dispatch({ effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) })
      appliedRevision = next
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
