import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
async function library(page: Page) { await page.getByRole('button', { name: 'Templates', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible() }
async function readDownload(page: Page, action: () => Promise<unknown>): Promise<Buffer> {
  const pending = page.waitForEvent('download'); await action(); const stream = await (await pending).createReadStream(), chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

test('four distinct templates preview all slides, preserve source and export with their theme', async ({ page }) => {
  await page.goto('/'); await library(page)
  const dialog = page.getByRole('dialog')
  for (const name of ['Orbit', 'Chalk', 'Thesis', 'Brief']) {
    await dialog.getByRole('button', { name, exact: true }).click()
    await expect(page.getByTestId('template-counter')).toHaveText('1 / 7')
    const frame = page.getByTitle('Template preview').contentFrame()
    await expect(frame.locator('svg.current h1')).toBeVisible()
    const first = await frame.locator('svg.current section').evaluate(section => ({ color: getComputedStyle(section).color, background: getComputedStyle(section).backgroundColor, image: getComputedStyle(section).backgroundImage }))
    expect(first.background !== 'rgba(0, 0, 0, 0)' || first.image !== 'none').toBe(true)
    for (let index = 0; index < 7; index++) {
      await expect(page.getByTestId('template-counter')).toHaveText(`${index + 1} / 7`)
      // Use the section's own authored coordinate space, independent of iframe scale.
      const size = await frame.locator('svg.current section').evaluate(section => ({ width: section.scrollWidth, height: section.scrollHeight, clientWidth: section.clientWidth, clientHeight: section.clientHeight }))
      expect(size.width, `${name} slide ${index + 1} horizontal overflow`).toBeLessThanOrEqual(size.clientWidth + 1)
      expect(size.height, `${name} slide ${index + 1} vertical overflow`).toBeLessThanOrEqual(size.clientHeight + 1)
      if (index < 6) await dialog.getByRole('button', { name: 'Next slide', exact: true }).click()
    }
  }
  await dialog.getByRole('button', { name: 'Orbit', exact: true }).click()
  await expect(page.getByTestId('template-counter')).toHaveText('1 / 7')
  await dialog.getByRole('button', { name: 'Create presentation', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Orbit.md *', exact: true })).toBeVisible()
  const expected = readFileSync('templates/orbit/starter.md')
  expect(await readDownload(page, () => page.getByRole('button', { name: 'Save', exact: true }).click())).toEqual(expected)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const html = (await readDownload(page, () => page.getByRole('button', { name: 'Export HTML', exact: true }).click())).toString()
  expect(html).toContain('Give your idea'); expect(html).toContain('--accent:#ef9b58')
})

test('applying a theme is one undoable edit and preserves every other front matter byte', async ({ page }) => {
  const source = '\ufeff---\r\nmarp: true\r\ntheme: "gaia" # keep the comment\r\ncustom: &items [one, two]\r\ncopy: *items\r\n---\r\n# First\r\n\r\n<!-- _class: lead -->\r\n\r\n---\r\n# Second\r\n'
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Open', exact: true }).click()
  await (await chooser).setFiles({ name: 'preserved.md', mimeType: 'text/markdown', buffer: Buffer.from(source) })
  await expect(page.getByTestId('slide-counter')).toHaveText('1/2')
  await library(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Chalk', exact: true }).click()
  await page.getByRole('button', { name: 'Apply theme', exact: true }).click()
  await expect(page.getByLabel('Unsaved', { exact: true })).toBeVisible()
  expect(await readDownload(page, () => page.getByRole('button', { name: 'Save', exact: true }).click())).toEqual(Buffer.from(source.replace('"gaia"', 'marpora-chalk')))
  await page.getByRole('textbox', { name: 'Markdown editor' }).focus(); await page.keyboard.press(`${mod}+z`)
  expect(await readDownload(page, () => page.getByRole('button', { name: 'Save', exact: true }).click())).toEqual(Buffer.from(source))
})

test('downloaded third-party packs persist offline across reload and validate before installation', async ({ page }) => {
  await page.goto('/'); await library(page)
  const json = (await readDownload(page, () => page.getByRole('button', { name: 'Download pack', exact: true }).click())).toString()
  const pack = JSON.parse(json)
  pack.id = 'example/stage'; pack.theme = 'example-stage'; pack.name = { en: 'Creator stage', zh: '创作者舞台' }; pack.author = 'Example creator'
  pack.css = pack.css.replaceAll('marpora-orbit', 'example-stage'); pack.starter = '\ufeff' + pack.starter.replaceAll('marpora-orbit', 'example-stage').replaceAll('\n', '\r\n')
  const choose = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import theme or pack', exact: true }).click()
  await (await choose).setFiles({ name: 'creator.marpora.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) })
  await expect(page.locator('.template-notice')).toContainText('Imported Creator stage')
  await expect(page.getByRole('heading', { name: 'Creator stage', exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await page.reload(); await library(page)
  await page.getByRole('button', { name: 'Creator stage', exact: true }).click()
  await expect(page.getByTestId('template-counter')).toHaveText('1 / 7')
  await page.getByRole('button', { name: 'Create presentation', exact: true }).click()
  await expect(page.getByTestId('slide-counter')).toHaveText('1/7')
  expect(await readDownload(page, () => page.getByRole('button', { name: 'Save', exact: true }).click())).toEqual(Buffer.from(pack.starter))
  await library(page)
  const invalid = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import theme or pack', exact: true }).click()
  await (await invalid).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...pack, scripts: ['bad.js'] })) })
  await expect(page.getByRole('alert')).toContainText('Invalid theme pack')
  // Native file dialogs can return keyboard focus to the document body.
  await page.locator('body').evaluate(element => { element.tabIndex = -1; element.focus() })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('small windows keep actions visible and malformed CSS cannot poison the local library', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 560 }); await page.goto('/'); await library(page)
  await expect(page.getByTestId('template-counter')).toHaveText('1 / 7')
  const create = page.getByRole('button', { name: 'Create presentation', exact: true })
  const bounds = await create.boundingBox()
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(560)
  const invalid = { schemaVersion: 1, id: 'test/broken', version: '1.0.0', name: { en: 'Broken', zh: '损坏' }, category: 'custom', description: { en: 'Broken CSS', zh: '损坏 CSS' }, author: 'Test', license: 'MIT', theme: 'test-broken', layouts: [], minAppVersion: '0.4.0', css: '/* @theme test-broken */\n@import "default";\nsection {', starter: '---\nmarp: true\ntheme: test-broken\n---\n# Never installed' }
  const pending = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import theme or pack' }).click()
  await (await pending).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) })
  await expect(page.getByRole('alert')).toContainText('Invalid theme pack')
  // Simulate storage left by a damaged or older importer, then restart the app.
  await page.evaluate(async pack => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('marpora.themes.v1', 1); request.onsuccess = () => resolve(request.result) })
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('packs', 'readwrite'); tx.objectStore('packs').put(pack); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) })
  }, invalid)
  await page.keyboard.press('Escape'); await page.reload(); await library(page)
  await expect(page.getByTestId('template-counter')).toHaveText('1 / 7')
  await expect(page.getByRole('button', { name: 'Broken', exact: true })).toHaveCount(0)
  await create.click(); await expect(page.getByTestId('slide-counter')).toHaveText('1/7')
})
