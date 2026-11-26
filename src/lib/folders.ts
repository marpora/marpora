import { invoke } from '@tauri-apps/api/core'
import { desktop, documentFromFile } from './files'
import type { OpenDocument } from './files'
import type { Folder, FolderEntry } from './workspace'

const browserFolders = new Map<string, Map<string, File>>()
const supported = /\.(?:md|markdown|mdown|txt|html?|pdf)$/i

export async function openFolder(): Promise<Folder | null> {
  if (desktop) return invoke('open_folder')
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('webkitdirectory', '')
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      if (!files.length) return resolve(null)
      const name = files[0].webkitRelativePath.split('/')[0]
      const root = `folder://${crypto.randomUUID()}/${name}`
      const entries = new Map(files.map(file => [`${root}/${file.webkitRelativePath.split('/').slice(1).join('/')}`, file]))
      browserFolders.set(root, entries)
      resolve({ path: root, name })
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function listFolder(root: string, path: string): Promise<FolderEntry[]> {
  if (desktop) return invoke('list_folder', { root, path })
  const files = browserFolders.get(root)
  if (!files) return []
  const entries = new Map<string, FolderEntry>()
  for (const key of files.keys()) {
    if (!key.startsWith(`${path}/`)) continue
    const parts = key.slice(path.length + 1).split('/')
    if (parts[0].startsWith('.') || ['node_modules', 'target', 'dist'].includes(parts[0])) continue
    if (parts.length > 1 || supported.test(parts[0])) entries.set(parts[0], { name: parts[0], path: `${path}/${parts[0]}`, directory: parts.length > 1 })
  }
  return [...entries.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
}

export async function openFolderFile(root: string, path: string): Promise<OpenDocument> {
  if (desktop) return invoke('open_workspace_file', { root, path })
  const file = browserFolders.get(root)?.get(path)
  if (!file) throw new Error('File is no longer available. Open the folder again.')
  return { ...await documentFromFile(file), path }
}

export async function browserResource(documentPath: string, relative: string): Promise<string | null> {
  for (const [root, files] of browserFolders) {
    if (!documentPath.startsWith(`${root}/`)) continue
    const base = `https://local/${documentPath.slice(root.length + 1)}`
    const normalized = decodeURIComponent(new URL(relative, base).pathname.slice(1))
    const file = files.get(`${root}/${normalized}`)
    if (!file) return null
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
  }
  return null
}
