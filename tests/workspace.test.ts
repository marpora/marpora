import { expect, test } from 'vitest'
import { newTab, isDirty, serializeDrafts, restoreDrafts } from '../src/lib/workspace'
import { importHtml } from '../src/lib/render'

test('draft sessions restore all unsaved text and encoding without stale disk permissions', () => {
  const first = newTab('---\nmarp: true\ncustom: "keep"\n---\n# One', 'one.md')
  first.path = '/private/old-file.md'; first.savedText = 'previous'; first.bom = true; first.lineEnding = 'crlf'
  const clean = newTab('# Clean', 'clean.md')
  const second = newTab('<!-- custom -->\n# Two', 'two.md'); second.savedText = null
  const restored = restoreDrafts(JSON.parse(JSON.stringify(serializeDrafts([first, clean, second], second.id))))
  expect(restored).toHaveLength(2)
  expect(restored[0].text).toBe(first.text)
  expect(restored[0].bom).toBe(true); expect(restored[0].lineEnding).toBe('crlf')
  expect(restored.map(tab => tab.path)).toEqual([null, null])
  expect(restored.every(isDirty)).toBe(true)
})

test('HTML import extracts Marp slides and strips active content without executing it', () => {
  const source = '<html><head><style>section{color:navy}</style><script>throw new Error("execute")</script></head><body><nav>Old navigation</nav><svg data-marpit-svg viewBox="0 0 800 600"><foreignObject><section><h1>First</h1><img src="pixel.png" onerror="bad()"></section></foreignObject></svg><svg data-marpit-svg viewBox="0 0 800 600"><foreignObject><section><h1>Second</h1><iframe src="https://example.com"></iframe></section></foreignObject></svg></body></html>'
  const imported = importHtml(source)
  expect(imported.mode).toBe('slides'); expect(imported.result.titles).toEqual(['First', 'Second'])
  expect(imported.result.aspectRatio).toBeCloseTo(4 / 3)
  expect(imported.result.css).toContain('color:navy')
  expect(imported.result.html).not.toMatch(/<script|onerror|<iframe|Old navigation/)
})
