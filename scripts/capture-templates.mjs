import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ ...(existsSync(executablePath) ? { executablePath } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', error => console.error(error.message))
await page.goto(process.env.MARPORA_TEST_URL || 'http://127.0.0.1:1420')
await page.getByRole('button', { name: 'Templates', exact: true }).click()
const findings = []
mkdirSync('output/templates', { recursive: true })
for (const name of ['Orbit', 'Chalk', 'Thesis', 'Brief']) {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click()
  await page.getByTestId('template-counter').filter({ hasText: '1 / 7' }).waitFor()
  const surface = page.getByTitle('Template preview'), frame = surface.contentFrame()
  await frame.locator('svg.current h1').waitFor()
  for (let index = 0; index < 7; index++) {
    await page.getByTestId('template-counter').filter({ hasText: `${index + 1} / 7` }).waitFor()
    const layout = await frame.locator('svg.current section').evaluate(section => ({
      width: section.scrollWidth, height: section.scrollHeight, clientWidth: section.clientWidth, clientHeight: section.clientHeight,
      children: [...section.children].map(node => ({ tag: node.tagName, text: node.textContent?.slice(0, 70), width: node.scrollWidth, height: node.scrollHeight, left: node.offsetLeft, top: node.offsetTop, style: node.getAttribute('style') }))
    }))
    findings.push({ name, slide: index + 1, ...layout })
    // Capture the actual slide surface, without drawing or reconstructing it.
    await surface.evaluate(element => { element.style.width = '960px'; element.style.height = '540px'; element.style.position = 'fixed'; element.style.left = '0'; element.style.top = '0'; element.style.zIndex = '999' })
    await frame.locator('body').evaluate(async () => { await document.fonts.ready })
    await surface.screenshot({ path: `output/templates/${name.toLowerCase()}-${index + 1}.png` })
    await surface.evaluate(element => element.removeAttribute('style'))
    if (index < 6) await page.getByRole('dialog').getByRole('button', { name: 'Next slide', exact: true }).click()
  }
}
await page.getByRole('dialog').getByRole('button', { name: 'Orbit', exact: true }).click()
await page.getByTestId('template-counter').filter({ hasText: '1 / 7' }).waitFor()
await page.getByTitle('Template preview').contentFrame().locator('svg.current h1').waitFor()
await page.screenshot({ path: 'docs/screenshots/templates.png' })
writeFileSync('output/templates/layout.json', JSON.stringify(findings, null, 2))
console.log(JSON.stringify(findings.filter(slide => slide.width > slide.clientWidth + 1 || slide.height > slide.clientHeight + 1), null, 2))
await browser.close()
for (const name of ['orbit','chalk','thesis','brief']) copyFileSync(`output/templates/${name}-1.png`, `templates/${name}/cover.png`)
