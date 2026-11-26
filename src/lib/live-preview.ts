import { EditorState, Facet, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import MarkdownIt from 'markdown-it'
import { translator, type Language, type MessageKey } from './i18n'
import { desktop } from './files'
import { invoke } from '@tauri-apps/api/core'

interface LiveOptions { language: Language; path: string | null }
interface Span { from: number; to: number }
interface Mark extends Span { kind: 'line' | 'hide' | 'mark' | 'bullet'; className?: string; context: Span }
interface Block extends Span { kind: 'code' | 'table' | 'image' | 'divider' | 'slideBreak'; source: string }
interface Model { marks: Mark[]; blocks: Block[] }
const config = Facet.define<LiveOptions, LiveOptions>({ combine: values => values.at(-1) || { language: 'en', path: null } })
export const liveFocus = StateEffect.define<boolean>()
const composing = StateEffect.define<boolean>()
const status = StateField.define({
  create: () => ({ focused: false, composing: false }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(liveFocus)) value = { ...value, focused: effect.value }
      if (effect.is(composing)) value = { ...value, composing: effect.value }
    }
    return value
  },
})

/** Ranges stay as editable source, including malformed or unknown Marp metadata. */
export function metadataRange(source: string): Span | undefined {
  const match = source.match(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/)
  if (match) return { from: 0, to: match[0].length }
  return /^\uFEFF?---[ \t]*\r?\n/.test(source) && /^\s*[\w-]+\s*:/m.test(source) ? { from: 0, to: source.length } : undefined
}

const intersects = (a: Span, b: Span) => a.from <= b.to && a.to >= b.from
const blockName = /^(?:Paragraph|ATXHeading\d|SetextHeading\d|Table|FencedCode|CodeBlock|HTMLBlock)$/
function context(node: SyntaxNode, doc: Text): Span {
  for (let parent: SyntaxNode | null = node; parent; parent = parent.parent) {
    if (blockName.test(parent.name)) return { from: parent.from, to: parent.to }
  }
  const line = doc.lineAt(node.from)
  return { from: line.from, to: line.to }
}

function model(state: EditorState): Model {
  const marks: Mark[] = []
  const blocks: Block[] = []
  const source = state.doc.toString()
  const metadata = metadataRange(source)
  const isDeck = metadata ? /^marp\s*:\s*true\s*$/m.test(source.slice(0, metadata.to)) : false
  const lineMark = (from: number, to: number, className: string) => {
    for (let number = state.doc.lineAt(from).number; number <= state.doc.lineAt(to).number; number++) {
      const line = state.doc.line(number)
      marks.push({ from: line.from, to: line.from, kind: 'line', className, context: { from, to } })
    }
  }
  if (metadata) lineMark(metadata.from, metadata.to, 'mp-metadata mp-raw')
  syntaxTree(state).iterate({ enter(ref) {
    const node = ref.node
    if (metadata && node.from < metadata.to && node.name !== 'Document') {
      // The Markdown parser may view YAML as a setext heading. Still walk a
      // containing node if an incomplete front matter section extends into it.
      if (node.to <= metadata.to) return false
      return
    }
    const span = context(node, state.doc)
    if (node.name === 'HTMLBlock' || node.name === 'CommentBlock') { lineMark(node.from, node.to, 'mp-directive mp-raw'); return false }
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'Table' || node.name === 'HorizontalRule') {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'Table') lineMark(node.from, node.to, 'mp-raw mp-code-source')
      const first = state.doc.lineAt(node.from), last = state.doc.lineAt(node.to)
      if (!state.doc.sliceString(first.from, node.from).trim() && !state.doc.sliceString(node.to, last.to).trim()) {
        const kind = node.name === 'Table' ? 'table' : node.name === 'HorizontalRule' ? isDeck ? 'slideBreak' : 'divider' : 'code'
        blocks.push({ from: first.from, to: last.to, kind, source: state.doc.sliceString(first.from, last.to) })
      }
      return false
    }
    if (node.name === 'Image') {
      // The widget only changes presentation. Clicking reveals the exact image
      // syntax, including its original path, alt text, and optional title.
      blocks.push({ from: node.from, to: node.to, kind: 'image', source: state.doc.sliceString(node.from, node.to) })
      return false
    }
    if (/^(ATXHeading|SetextHeading)\d$/.test(node.name)) {
      const level = node.name.slice(-1)
      lineMark(node.from, node.from, `mp-heading mp-h${level}`)
    }
    if (['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark', 'QuoteMark'].includes(node.name)) {
      let to = node.to
      if (node.name === 'HeaderMark' || node.name === 'QuoteMark') {
        while (to < state.doc.lineAt(node.to).to && state.doc.sliceString(to, to + 1) === ' ') to++
      }
      marks.push({ from: node.from, to, kind: 'hide', context: span })
    }
    if (node.name === 'ListMark') marks.push({ from: node.from, to: node.to, kind: /^[*+-]$/.test(state.doc.sliceString(node.from, node.to)) ? 'bullet' : 'mark', className: 'mp-list-marker', context: span })
    if (node.name === 'Blockquote') lineMark(node.from, node.to, 'mp-quote')
    const classes: Record<string, string> = { StrongEmphasis: 'mp-strong', Emphasis: 'mp-em', Strikethrough: 'mp-strike', InlineCode: 'mp-code', Link: 'mp-link' }
    if (classes[node.name]) marks.push({ from: node.from, to: node.to, kind: 'mark', className: classes[node.name], context: span })
    if (node.parent?.name === 'Link' && ['LinkMark', 'URL', 'LinkTitle'].includes(node.name)) marks.push({ from: node.from, to: node.to, kind: 'hide', context: span })
    if (node.name === 'Paragraph' && /^\s*%%/m.test(state.doc.sliceString(node.from, node.to))) {
      for (let number = state.doc.lineAt(node.from).number; number <= state.doc.lineAt(node.to).number; number++) {
        const line = state.doc.line(number)
        if (/^\s*%%/.test(line.text)) lineMark(line.from, line.to, 'mp-directive mp-raw')
      }
    }
  } })
  return { marks, blocks }
}

const parsed = StateField.define<Model>({
  create: model,
  update(value, transaction) {
    return transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state) ? model(transaction.state) : value
  },
})

const renderer = new MarkdownIt({ html: false, linkify: false, typographer: false })
class Bullet extends WidgetType {
  eq() { return true }
  toDOM() { const span = document.createElement('span'); span.className = 'mp-bullet'; span.textContent = '•'; return span }
  ignoreEvent() { return false }
}
class RenderedBlock extends WidgetType {
  constructor(readonly block: Block, readonly options: LiveOptions) { super() }
  eq(other: RenderedBlock) { return this.block.from === other.block.from && this.block.source === other.block.source && this.block.kind === other.block.kind && this.options.language === other.options.language && this.options.path === other.options.path }
  toDOM(view: EditorView) {
    const { block } = this
    const t = translator(this.options.language)
    const element: HTMLElement = document.createElement(block.kind === 'image' ? 'span' : 'div')
    element.className = `mp-rendered mp-rendered-${block.kind}`
    element.tabIndex = 0
    element.setAttribute('role', 'button')
    const key: MessageKey = block.kind
    element.setAttribute('aria-label', t('editBlock', { kind: t(key) }))
    if (block.kind === 'divider' || block.kind === 'slideBreak') {
      const label = document.createElement('span')
      label.textContent = t(block.kind)
      element.append(label)
    } else {
      // This parser disables raw HTML. Only known Markdown blocks are inserted;
      // author HTML and Marp directives are always left as source in the editor.
      element.innerHTML = renderer.render(block.source)
      element.querySelectorAll('img').forEach(image => {
        image.loading = 'lazy'
        image.onload = () => view.requestMeasure()
        image.onerror = () => { image.title = t('imageFailed'); view.requestMeasure() }
        const source = image.getAttribute('src')
        if (desktop && this.options.path && source && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) {
          void invoke<string>('read_resource', { documentPath: this.options.path, relativePath: decodeURIComponent(source) }).then(url => { if (image.isConnected) image.src = url }).catch(() => { image.title = t('imageFailed') })
        }
      })
    }
    const edit = () => {
      view.dispatch({ selection: { anchor: Math.min(block.from, view.state.doc.length) }, effects: liveFocus.of(true), scrollIntoView: true })
      view.focus()
    }
    element.addEventListener('mousedown', event => { event.preventDefault(); edit() })
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit() } })
    return element
  }
  ignoreEvent() { return true }
  get estimatedHeight() { return this.block.kind === 'image' ? 140 : this.block.kind === 'table' ? 140 : this.block.kind === 'code' ? 100 : 36 }
}

function decorate(state: EditorState): DecorationSet {
  const options = state.facet(config)
  const focused = state.field(status).focused
  const active = (span: Span) => focused && state.selection.ranges.some(selection => intersects(selection, span))
  const decorations: Range<Decoration>[] = []
  const { marks, blocks } = state.field(parsed)
  const replaced = blocks.filter(block => !active(contextAt(block, state)))
  const enclosed = (mark: Span) => {
    let from = 0, to = replaced.length
    while (from < to) { const middle = (from + to) >>> 1; if (replaced[middle].from <= mark.from) from = middle + 1; else to = middle }
    return from > 0 && mark.to <= replaced[from - 1].to
  }
  for (const mark of marks) {
    if (enclosed(mark)) continue
    if (mark.kind === 'line') decorations.push(Decoration.line({ class: mark.className }).range(mark.from))
    else if (!active(mark.context) && mark.to > mark.from) decorations.push((mark.kind === 'hide' ? Decoration.replace({}) : mark.kind === 'bullet' ? Decoration.replace({ widget: new Bullet() }) : Decoration.mark({ class: mark.className })).range(mark.from, mark.to))
  }
  for (const block of replaced) {
    decorations.push(Decoration.replace({ widget: new RenderedBlock(block, options), block: block.kind !== 'image' }).range(block.from, block.to))
  }
  return Decoration.set(decorations, true)
}

function contextAt(block: Block, state: EditorState): Span {
  if (block.kind !== 'image') return block
  return context(syntaxTree(state).resolveInner(block.from, 1), state.doc)
}

export const liveDecorations = StateField.define<DecorationSet>({
  create: decorate,
  update(value, transaction) {
    if (transaction.state.field(status).composing) return value.map(transaction.changes)
    return transaction.docChanged || transaction.selection || transaction.reconfigured || transaction.effects.length || syntaxTree(transaction.startState) !== syntaxTree(transaction.state) ? decorate(transaction.state) : value
  },
  provide: field => EditorView.decorations.from(field),
})

/** Installing/removing this extension never changes EditorState.doc or history. */
export function livePreview(options: LiveOptions): Extension {
  return [config.of(options), status, parsed, liveDecorations,
    // Register layout-affecting typography as a CodeMirror theme so that a
    // mode/document reconfiguration invalidates its cached line geometry.
    EditorView.theme({
      '&': { fontSize: '16px' },
      '.cm-content': { fontFamily: 'var(--font-body)' },
      '.cm-line.mp-heading': { lineHeight: '1.5', paddingBlock: '8px' },
      '.cm-line.mp-h1': { fontSize: '32px' },
      '.cm-line.mp-h2': { fontSize: '25px' },
      '.cm-line.mp-h3': { fontSize: '21px' },
    }),
    EditorView.contentAttributes.of({ class: 'mp-live-content' }),
    EditorView.editorAttributes.of({ class: 'mp-live' }),
    EditorView.domEventHandlers({
      focus: (_, view) => { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: liveFocus.of(true) }) }) },
      blur: (_, view) => { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: liveFocus.of(false) }) }) },
      compositionstart: (_, view) => { view.dispatch({ effects: composing.of(true) }) },
      compositionend: (_, view) => { queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects: composing.of(false) }) }) },
    }),
  ]
}
