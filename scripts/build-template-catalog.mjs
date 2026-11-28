import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = resolve(process.argv[2] || resolve(root, 'dist-catalog'))
mkdirSync(resolve(destination, 'packs'), { recursive: true })
mkdirSync(resolve(destination, 'previews'), { recursive: true })
const entries = []
for (const id of ['orbit', 'chalk', 'thesis', 'brief']) {
  const path = resolve(root, 'templates', id)
  const manifest = JSON.parse(readFileSync(resolve(path, 'manifest.json'), 'utf8'))
  const css = readFileSync(resolve(path, 'theme.css'), 'utf8'), starter = readFileSync(resolve(path, 'starter.md'), 'utf8')
  if (manifest.schemaVersion !== 1 || manifest.id !== `marpora/${id}` || !css.includes(`@theme ${manifest.theme}`) || !starter.includes(`theme: ${manifest.theme}`)) throw new Error(`Invalid template: ${id}`)
  const pack = Buffer.from(JSON.stringify({ ...manifest, css, starter }, null, 2) + '\n')
  const name = `${id}-${manifest.version}.marpora.json`
  writeFileSync(resolve(destination, 'packs', name), pack)
  copyFileSync(resolve(path, 'cover.png'), resolve(destination, 'previews', `${id}.png`))
  entries.push({ ...manifest, preview: `previews/${id}.png`, download: `packs/${name}`, bytes: pack.length, sha256: createHash('sha256').update(pack).digest('hex') })
}
writeFileSync(resolve(destination, 'catalog.json'), JSON.stringify({ schemaVersion: 1, publisher: 'Marpora', packages: entries }, null, 2) + '\n')
copyFileSync(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'))
console.log(`Built ${entries.length} versioned packs and catalog: ${destination}`)
