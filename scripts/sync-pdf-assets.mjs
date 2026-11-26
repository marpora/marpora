import { cp, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = new URL('../node_modules/pdfjs-dist/', import.meta.url)
const target = new URL('../public/pdfjs/', import.meta.url)
await mkdir(target, { recursive: true })
for (const name of ['cmaps', 'standard_fonts', 'wasm']) await cp(new URL(name, source), new URL(name, target), { recursive: true })
await copyFile(new URL('LICENSE', source), new URL('LICENSE', target))
console.log(`PDF preview assets ready: ${fileURLToPath(target)}`)
