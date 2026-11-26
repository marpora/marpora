import { describe, expect, test } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { history, undo, redo } from '@codemirror/commands'
import { liveDecorations, liveFocus, livePreview, metadataRange } from '../src/lib/live-preview'
import { uic } from '../src/lib/samples'
import { defaults, loadPreferences, preferencesKey, resolveAppearance } from '../src/lib/preferences'
import { errorMessage, translator } from '../src/lib/i18n'

const source = `---
marp: true
theme: "uic-cs"   # retain the quotes and spacing
paginate: true
custom: &anchor { unknown: 'kept' }
alias: *anchor
---

<!-- _class: title -->
# Original title

Text with **bold**, *italic*, [a link](https://example.com) and \`code\`.

---
<!-- _paginate: false -->
%% private comment
<pause>
<enter />
<div class="cols">

custom content

</div>

~~~md
---
<!-- hide -->
%% this is code
~~~
`

describe('lossless live editing', () => {
  test.each([source, uic])('does not rewrite source when modes, locale, selection or theme change', document => {
    const presentation = new Compartment()
    let state = EditorState.create({ doc: document, extensions: [markdown({ base: markdownLanguage }), history(), presentation.of(livePreview({ language: 'en', path: null }))] })
    for (let i = 0; i < 8; i++) {
      state = state.update({ effects: presentation.reconfigure([]) }).state
      state = state.update({ effects: presentation.reconfigure(livePreview({ language: i % 2 ? 'zh' : 'en', path: null })) }).state
      state = state.update({ selection: { anchor: Math.min(i * 27, state.doc.length) }, effects: liveFocus.of(true) }).state
      expect(state.doc.toString()).toBe(document)
    }
  })

  test('an edit changes only the targeted characters, and undo survives mode switches', () => {
    const presentation = new Compartment()
    let state = EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage }), history(), presentation.of(livePreview({ language: 'en', path: null }))] })
    const from = source.indexOf('Original title')
    state = state.update({ changes: { from, to: from + 'Original title'.length, insert: '新的标题' } }).state
    const edited = source.replace('Original title', '新的标题')
    expect(state.doc.toString()).toBe(edited)
    state = state.update({ effects: presentation.reconfigure([]) }).state
    state = state.update({ effects: presentation.reconfigure(livePreview({ language: 'zh', path: null })) }).state
    const dispatch = (transaction: { state: EditorState }) => { state = transaction.state }
    expect(undo({ state, dispatch })).toBe(true)
    expect(state.doc.toString()).toBe(source)
    expect(redo({ state, dispatch })).toBe(true)
    expect(state.doc.toString()).toBe(edited)
  })

  test('renders display widgets while retaining protected front matter and directives', () => {
    const state = EditorState.create({ doc: source, extensions: [markdown({ base: markdownLanguage }), livePreview({ language: 'en', path: null })] })
    const metadata = metadataRange(source)!
    const widgets: string[] = []
    state.field(liveDecorations).between(0, state.doc.length, (from, to, decoration) => {
      if (decoration.spec.widget) {
      expect(from).toBeGreaterThan(metadata.to)
        widgets.push(state.doc.sliceString(from, to))
      }
    })
    expect(widgets.some(widget => widget.startsWith('~~~md'))).toBe(true)
    expect(widgets).not.toContain('<pause>')
    expect(widgets).not.toContain('<!-- _class: title -->')
  })
})

describe('preferences', () => {
  test('defaults to English and system colors and validates persisted settings', () => {
    localStorage.clear()
    expect(loadPreferences()).toEqual(defaults)
    localStorage.setItem(preferencesKey, JSON.stringify({ language: 'unknown', appearance: 'invalid', accent: '<bad>' }))
    expect(loadPreferences()).toEqual(defaults)
    expect(resolveAppearance('system', true)).toBe('dark')
    expect(resolveAppearance('light', true)).toBe('light')
    expect(translator('en')('save')).toBe('Save')
    expect(translator('zh')('save')).toBe('保存')
    expect(errorMessage('MAR_PORA:diskConflict', 'en')).toContain('another application')
  })
})
