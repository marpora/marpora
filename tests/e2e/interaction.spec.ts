import { expect, test, type Page, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
const uic = readFileSync(new URL('../../examples/uic/example.md', import.meta.url), 'utf8')
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
async function openDeck(page: Page) {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await (await chooser).setFiles({ name: 'interaction.md', mimeType: 'text/markdown', buffer: Buffer.from(uic) })
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
}
async function revealLine(page: Page, text: string): Promise<Locator> {
  const target = page.locator('.cm-line').filter({ hasText: text }).first()
  await page.locator('.cm-scroller').evaluate(element => { element.scrollTop = 0 })
  await page.locator('.cm-scroller').hover()
  for (let index = 0; index < 30 && !await target.count(); index++) {
    await page.mouse.wheel(0, 180)
    await page.waitForTimeout(30)
  }
  await target.scrollIntoViewIfNeeded()
  return target
}

test('live clicks after slide breaks and rendered tables land on the displayed line', async ({ page }) => {
  await openDeck(page)
  for (const title of ['A normal content slide', 'Two columns, revealed in steps', 'Tables, boxes, and helpers']) {
    const target = await revealLine(page, title)
    // Defocus the editor so the click also exercises live-source reveal on focus.
    await page.getByRole('button', { name: 'Next slide', exact: true }).click()
    const rect = (await target.boundingBox())!
    await page.mouse.click(rect.x + 80, rect.y + rect.height / 2)
    const line = uic.split('\n').findIndex(value => value === `## ${title}`) + 1
    await expect(page.locator('.cursor-position')).toContainText(`Ln ${line},`)
  }
  // An edit must change only the clicked title, including after mode/tab switches.
  await page.keyboard.press('End'); await page.keyboard.insertText(' — targeted edit')
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toContainText('## Tables, boxes, and helpers — targeted edit')
  await page.getByRole('button', { name: 'Live preview', exact: true }).click()
  await page.getByRole('button', { name: 'New document', exact: true }).click()
  await page.getByRole('tab', { name: 'interaction.md *', exact: true }).click()
  await page.getByRole('textbox', { name: 'Markdown editor' }).focus()
  await page.keyboard.press(`${mod}+z`)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const stream = await (await download).createReadStream(), chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString()).toBe(uic)
})

test('clicking the slide or preview chrome gives arrow keys to slide navigation', async ({ page }) => {
  await openDeck(page)
  await page.getByRole('button', { name: 'Source', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown editor' })
  await editor.click(); await page.keyboard.press(`${mod}+Home`)
  const cursor = await page.locator('.cursor-position').textContent()
  const frame = await page.locator('iframe').boundingBox()
  // Click the actual slide surface; WebKit foreignObject text rects can be unscaled.
  await page.mouse.click(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2)
  for (const [key, counter] of [['ArrowRight', '2/10'], ['ArrowDown', '3/10'], ['ArrowLeft', '2/10'], ['ArrowUp', '1/10']]) {
    await page.keyboard.press(key)
    await expect(page.getByTestId('slide-counter')).toHaveText(counter)
    await expect(page.locator('.cursor-position')).toHaveText(cursor!)
  }
  // Empty space in the right pane must also transfer focus away from CodeMirror.
  await editor.click(); await page.keyboard.press(`${mod}+Home`)
  await page.locator('.deck-heading > span').click()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('slide-counter')).toHaveText('2/10')
  // Returning to the editor restores ordinary cursor movement without paging.
  await editor.click(); await page.keyboard.press(`${mod}+Home`)
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.cursor-position')).toContainText('Ln 2,')
  await expect(page.getByTestId('slide-counter')).toHaveText('1/10')
  await expect(page.getByLabel('Unsaved', { exact: true })).toHaveCount(0)
})
