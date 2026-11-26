import { describe, expect, test } from 'vitest'
import { effectiveMode, frontmatter, slideStarts } from '../src/lib/document'
import { previewDocument, renderPreview } from '../src/lib/render'
import { uic } from '../src/lib/samples'

describe('document detection', () => {
  test('uses parsed YAML and respects explicit preview modes', () => {
    expect(effectiveMode('---\r\nmarp: true\r\n---\r\n# hello', 'auto')).toBe('slides')
    expect(effectiveMode('---\nmarp: "true"\n---\n# hello', 'auto')).toBe('document')
    expect(effectiveMode('---\nmarp: true\n---\n# hello', 'document')).toBe('document')
    expect(frontmatter('---\nmarp: [\n---\ntext').error).toBeTruthy()
  })

  test('does not treat code fences or comment contents as slide separators', () => {
    const source = '---\nmarp: true\n---\n# one\n\n```md\n---\n```\n<!--\n---\n-->\n\n---\n# two'
    expect(slideStarts(source)).toHaveLength(2)
    expect(source.slice(slideStarts(source)[1])).toBe('# two')
  })
})

describe('rendering real UIC content', () => {
  test('renders all ten slides, class variants, columns, pauses and notes', async () => {
    const rendered = await renderPreview(uic, { mode: 'slides' })
    const doc = new DOMParser().parseFromString(rendered.html, 'text/html')
    expect(rendered.titles).toHaveLength(10)
    expect(doc.querySelectorAll('svg[data-marpit-svg]')).toHaveLength(10)
    expect(doc.querySelector('section.title')).toBeTruthy()
    expect(doc.querySelector('section.clicker')).toBeTruthy()
    expect(doc.querySelector('section.answer')).toBeTruthy()
    expect(doc.querySelectorAll('.cols > div')).toHaveLength(2)
    expect(doc.querySelectorAll('[data-marpit-fragment]').length).toBeGreaterThanOrEqual(4)
    expect(rendered.notes[0].join('')).toContain('Presenter notes')
    expect(rendered.css).toContain('--uic-navy')
  })

  test('honors hidden slides and line comments while keeping fenced source intact', async () => {
    const source = '---\nmarp: true\n---\n# visible\n%% private line\n\n```txt\n%% keep in code\n```\n\n---\n<!-- hide -->\n# secret\n\n---\n# last'
    const rendered = await renderPreview(source, { mode: 'slides' })
    expect(rendered.titles).toEqual(['visible', 'last'])
    expect(rendered.html).not.toContain('private line')
    expect(rendered.html).toContain('%% keep in code')
    expect(rendered.html).not.toContain('secret')
    expect(rendered.positions).toHaveLength(2)
    expect(source.slice(rendered.positions![1])).toContain('# last')
    expect(source.slice(rendered.positions![1])).not.toContain('# secret')
  })

  test('hides content when every slide is hidden', async () => {
    const rendered = await renderPreview('---\nmarp: true\n---\n<!-- hide -->\n# hidden', { mode: 'slides' })
    expect(rendered.html).not.toContain('hidden')
    expect(rendered.titles).toHaveLength(0)
  })

  test('supports headingDivider and 4:3 slides with engine source positions', async () => {
    const source = '---\nmarp: true\nheadingDivider: 1\nsize: 4:3\n---\n# first\n\ntext\n\n# second'
    const rendered = await renderPreview(source, { mode: 'slides' })
    expect(rendered.titles).toEqual(['first', 'second'])
    expect(source.slice(rendered.positions![1])).toBe('# second')
    expect(rendered.aspectRatio).toBeCloseTo(4 / 3)
  })

  test('removes executable authored content without breaking slide SVG', async () => {
    const payload = '# Heading\n\n<img src="x" onerror="alert(1)"><script>alert(1)</script><iframe srcdoc="bad"></iframe>\n\n[link](javascript:alert(1))'
    for (const mode of ['document', 'slides'] as const) {
      const rendered = await renderPreview(payload, { mode })
      expect(rendered.html).not.toMatch(/<script|onerror=|<iframe|href="javascript:/i)
      expect(rendered.html).toContain('Heading')
      expect(previewDocument(rendered, mode)).toContain("script-src 'none'")
    }
  })
})
