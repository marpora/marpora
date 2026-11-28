import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function openUic(page: Page) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await (await chooser).setFiles(new URL('../../examples/uic/example.md', import.meta.url).pathname)
}

async function sourceWorkspace(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await page.getByRole('button', { name: 'Editor and preview', exact: true }).click()
}

test('Markdown edits preview live and keep undo history', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await sourceWorkspace(page)
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('h1')).toHaveText('Room to think.')
  const editorBounds = await page.locator('.cm-editor').boundingBox()
  const footerBounds = await page.locator('.statusbar').boundingBox()
  expect(editorBounds!.y + editorBounds!.height).toBeLessThanOrEqual(footerBounds!.y + 1)
  await expect(page.locator('.cm-scroller')).toHaveJSProperty('clientHeight', Math.round(editorBounds!.height))
  await page.screenshot({ path: 'docs/screenshots/workspace.png' })
  const editor = page.getByRole('textbox', { name: 'Markdown editor' })
  await editor.fill('# 中文编辑验证\n\n**实时预览**\n\n| A | B |\n|---|---|\n| 1 | 2 |')
  await expect(preview.locator('h1')).toHaveText('中文编辑验证')
  await expect(preview.locator('table')).toBeVisible()
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/markdown.png' })
  expect(failures).toEqual([])
})

test('UIC template renders and supports slide navigation', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await sourceWorkspace(page)
  await openUic(page)
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('svg.current section.title')).toBeVisible()
  await page.getByRole('button', { name: 'Next slide' }).click()
  await expect(page.getByTestId('slide-counter')).toHaveText('2/10')
  await expect(preview.locator('svg.current h2')).toHaveText("Today's plan")
  await page.getByRole('button', { name: '06 Code, then', exact: false }).click()
  await page.getByRole('button', { name: '01 CS 000', exact: false }).click()
  await page.screenshot({ path: 'docs/screenshots/uic-slides.png' })
  expect(failures).toEqual([])
})

test('recovers an unsaved draft and renders formula assets', async ({ page }) => {
  await sourceWorkspace(page)
  const editor = page.getByRole('textbox', { name: 'Markdown editor' })
  await editor.fill('---\nmarp: true\n---\n# Formula\n\n$$E = mc^2$$')
  const preview = page.frameLocator('iframe')
  await expect(preview.locator('.katex')).toBeVisible()
  const fonts = await preview.locator('body').evaluate(async () => (await document.fonts.load('16px KaTeX_Main')).length)
  expect(fonts).toBeGreaterThan(0)
  await page.waitForFunction(() => localStorage.getItem('marpora.session.v2')?.includes('Formula'))
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.getByRole('status')).toContainText('Unsaved draft restored')
  await expect(editor).toContainText('Formula')
})

test('opens the user template unchanged and offers download/save', async ({ page }) => {
  await sourceWorkspace(page)
  const source = readFileSync(new URL('../../examples/uic/example.md', import.meta.url), 'utf8')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await (await chooser).setFiles({ name: 'example.md', mimeType: 'text/markdown', buffer: Buffer.from(source) })
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const file = await download
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString('utf8')).toBe(source)
})

test('tabs preserve independent history and closing guards unsaved changes', async ({ page }) => {
  await sourceWorkspace(page)
  const editor = page.getByRole('textbox', { name: 'Markdown editor' })
  await editor.fill('# draft to preserve')
  await openUic(page)
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await editor.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(editor).not.toContainText('draft to preserve')
  await page.getByRole('tab', { name: 'Welcome.md *', exact: true }).click()
  await expect(editor).toHaveText('# draft to preserve')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Close Welcome.md', exact: true }).click()
  await expect(editor).toHaveText('# draft to preserve')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Close Welcome.md', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Welcome.md *', exact: true })).toHaveCount(0)
})
