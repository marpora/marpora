import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
const uic = readFileSync(new URL('../../examples/uic/example.md', import.meta.url), 'utf8')

async function openText(page: Page, source: string | Buffer) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await (await chooser).setFiles({ name: 'fixture.md', mimeType: 'text/markdown', buffer: Buffer.isBuffer(source) ? source : Buffer.from(source) })
}

async function savedBytes(page: Page, label = 'Save'): Promise<Buffer> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: label, exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

test('English and live editing are defaults; system appearance updates and preferences persist', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Live preview', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'system')
  await expect(page.locator('.mp-h1')).not.toContainText('#')
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByLabel('Appearance', { exact: true }).selectOption('light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.screenshot({ path: 'docs/screenshots/live-light.png' })
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByLabel('Accent color', { exact: true }).selectOption('teal')
  await page.getByLabel('Language', { exact: true }).selectOption('zh')
  await expect(page.getByRole('button', { name: '打开', exact: true })).toBeVisible()
  await expect(page.getByLabel('未保存', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal')
  await page.getByRole('button', { name: '偏好设置', exact: true }).click()
  await page.getByLabel('外观', { exact: true }).selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('live code, tables and images reveal editable source on click without rewriting it', async ({ page }) => {
  const source = '# Heading\n\nText with **bold** and *emphasis*.\n\n```ts\nconst original = "keep quotes"\n```\n\n| A | B |\n|:---|---:|\n| 1 | 2 |\n\n![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJJQAAAAASUVORK5CYII=)\n'
  await page.goto('/')
  await openText(page, source)
  await expect(page.getByRole('button', { name: 'Edit code', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit table', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit image', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit table', exact: true }).click()
  await expect(page.locator('.cm-line').filter({ hasText: '| A | B |' })).toBeVisible()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await page.getByRole('button', { name: 'Live preview', exact: true }).click()
  await page.getByRole('button', { name: 'Edit code', exact: true }).click()
  await expect(page.locator('.cm-line').filter({ hasText: '```ts' })).toBeVisible()
  expect((await savedBytes(page)).toString()).toBe(source)
})

test('Marp edits and mode switches preserve metadata, page breaks and custom directives byte for byte', async ({ page }) => {
  const source = uic.replace('author: Your Name', 'author: "Your Name"  # keep this comment\nunknown: &value {a: 1}\ncopy: *value') + '\n%% retain this comment\n<enter />\n<!-- custom: untouched -->\n'
  await page.goto('/')
  await openText(page, source)
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  await expect(page.locator('.mp-metadata')).toContainText(['---', 'marp: true', 'theme: uic-cs', 'size: 16:9', 'paginate: true', 'title: "Example Lecture"', 'author: "Your Name"  # keep this comment', 'unknown: &value {a: 1}', 'copy: *value', '---'])
  const heading = page.locator('.cm-line.mp-h2').filter({ hasText: 'Lecture Title' })
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' — edited')
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await page.getByRole('button', { name: 'Live preview', exact: true }).click()
  const expected = source.replace('## Lecture Title\n', '## Lecture Title — edited\n')
  expect((await savedBytes(page)).toString()).toBe(expected)
})

test('select all, delete and undo across rendered blocks retain BOM and CRLF on save', async ({ page }) => {
  const source = Buffer.from('\uFEFF' + uic.replace(/\n/g, '\r\n'))
  await page.goto('/')
  await openText(page, source)
  await page.getByRole('textbox', { name: 'Markdown editor' }).click()
  await page.keyboard.press(`${mod}+a`)
  await page.keyboard.press('Backspace')
  await page.keyboard.press(`${mod}+z`)
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await page.getByRole('button', { name: 'Live preview', exact: true }).click()
  }
  expect(await savedBytes(page)).toEqual(source)
})

test('composition input remains editable and undo survives source mode', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await page.goto('/')
  await openText(page, '# Heading\n\nplain\n')
  const line = page.locator('.cm-line').filter({ hasText: /^plain$/ })
  await line.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Control+e' : 'End')
  await expect(page.locator('.cursor-position')).toHaveText('Ln 3, Col 6')
  const editor = page.getByRole('textbox', { name: 'Markdown editor' })
  await editor.dispatchEvent('compositionstart', { data: '' })
  await page.keyboard.insertText('中文')
  await editor.dispatchEvent('compositionend', { data: '中文' })
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await editor.click()
  await page.keyboard.press(`${mod}+z`)
  await page.keyboard.press(`${mod}+Shift+z`)
  expect((await savedBytes(page)).toString()).toBe('# Heading\n\nplain中文\n')
  expect(failures).toEqual([])
})

test('dark document preview follows the app while UIC slide colors remain authored', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Editor and preview', exact: true }).click()
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await preview.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(25, 29, 36)')
  await openText(page, uic)
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  const color = await preview.locator('svg.current h1').evaluate(el => getComputedStyle(el).color)
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByLabel('Accent color', { exact: true }).selectOption('rose')
  expect(await preview.locator('svg.current h1').evaluate(el => getComputedStyle(el).color)).toBe(color)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'docs/screenshots/live-dark.png' })
})
