import { expect, test } from 'vitest'
import { builtins } from '../src/lib/template-library'
import { applyTheme, themeName, validatePack } from '../src/lib/theme-pack'
import { renderPreview } from '../src/lib/render'

test('every bundled pack validates and all seven slides render with private notes', async () => {
  expect(builtins).toHaveLength(4)
  for (const pack of builtins) {
    expect(validatePack(pack).theme).toBe(pack.theme)
    const rendered = await renderPreview(pack.starter, { mode: 'slides' })
    expect(rendered.warning).toBeUndefined()
    expect(rendered.titles).toHaveLength(7)
    expect(rendered.theme).toBe(pack.theme)
    expect(rendered.css).toMatch(/--accent\s*:/)
    expect(rendered.notes.some(notes => notes.length)).toBe(true)
    expect(rendered.html).not.toContain('<!--')
  }
})

test('theme edits replace only the YAML scalar and preserve BOM, comments, spacing and CRLF', () => {
  const source = '\ufeff---\r\n# keep me\r\nmarp: true\r\ntheme : "uic-cs" # theme note\r\ncustom: &item [one, two]\r\ncopy: *item\r\n...\r\n\r\n# title\r\n<!-- _class: lead -->\r\n---\r\n# second'
  expect(applyTheme(source, 'marpora-orbit')).toBe(source.replace('"uic-cs"', 'marpora-orbit'))
  const flow = '---\n{marp: true, theme: "gaia", custom: [x,y]}\n---\n# deck'
  expect(applyTheme(flow, 'marpora-chalk')).toBe(flow.replace('"gaia"', 'marpora-chalk'))
  const anchored = '---\nmarp: true\ntheme: &look gaia\ncustom: *look\n---\n# deck'
  expect(applyTheme(anchored, 'marpora-thesis')).toBe(anchored.replace('&look gaia', '&look marpora-thesis'))
})

test('new fields insert without serializing and complex or malformed YAML is never rewritten', () => {
  const source = '---\nmarp: true\ncustom: "retained"\n---\n# one\n---\n# two'
  expect(applyTheme(source, 'marpora-brief')).toBe(source.replace('\n---\n# one', '\ntheme: marpora-brief\n---\n# one'))
  expect(applyTheme('# one\n---\n# two', 'marpora-orbit')).toBe('---\nmarp: true\ntheme: marpora-orbit\n---\n# one\n---\n# two')
  for (const yaml of ['theme: [bad]', 'theme: >\n  gaia', 'theme: *unknown', 'theme:', 'theme: gaia\ntheme: default', 'marp: [']) expect(() => applyTheme(`---\n${yaml}\n---\n# untouched`, 'marpora-orbit')).toThrow()
})

test('pack import rejects executable metadata, incompatible versions and external resources', () => {
  const pack = builtins[0]
  for (const change of [{ schemaVersion: 2 }, { theme: 'wrong' }, { scripts: ['bad.js'] }, { engine: 'custom' }, { css: pack.css + '\n@import "https://example.com/theme.css";' }, { css: pack.css + '\nsection{background:url(../file.png)}' }, { starter: pack.starter + '\n<script>bad()</script>' }, { starter: pack.starter + '\n![image][asset]\n\n[asset]: https://example.com/image.png' }, { starter: pack.starter + '\n<img src=https://example.com/image.png>' }]) expect(() => validatePack({ ...pack, ...change })).toThrow()
  expect(() => validatePack({ ...pack, minAppVersion: '0.5.0' })).toThrow('MAR_PORA:themePackNewer')
  expect(themeName('/* metadata */\n/* @theme creator-new */')).toBe('creator-new')
})


test('literal HTML in technical code examples is presentation text, not an asset', () => {
  const pack = builtins[0]
  expect(validatePack({ ...pack, starter: pack.starter + '\n```html\n<img src="example.png">\n<script>example()</script>\n```\n' }).theme).toBe(pack.theme)
  expect(() => validatePack({ ...pack, starter: pack.starter + '\n<style>section{background:url(https://example.com/a.png)}</style>' })).toThrow()
})
