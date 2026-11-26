<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorState, Compartment, type Extension } from '@codemirror/state'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { defaultHighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from '@codemirror/language'
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

  let { value, revision, onedit, oncursor, onscroll, wrap = true }: {
    value: string; revision: number; onedit: (text: string) => void;
    oncursor: (line: number, column: number, offset: number) => void;
    onscroll: (progress: number) => void; wrap?: boolean;
  } = $props()
  let host: HTMLDivElement
  let view: EditorView | undefined
  let editorExtensions: Extension[] = []
  let appliedRevision = -1
  const wrapping = new Compartment()

  export function focus() { view?.focus() }
  export function jumpTo(offset: number) {
    if (!view) return
    const pos = Math.min(offset, view.state.doc.length)
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    view.focus()
  }

  onMount(() => {
    editorExtensions = [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(),
        markdown(), syntaxHighlighting(defaultHighlightStyle), highlightSelectionMatches(),
        placeholder('写下你的第一个想法…'),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器', spellcheck: 'false', autocapitalize: 'off' }),
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
</script>

<div class="editor-host" bind:this={host}></div>
