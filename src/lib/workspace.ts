import { EditorState } from '@codemirror/state'
import type { PreviewMode } from './document'
import { fileName } from './document'
import type { OpenDocument } from './files'

export type FileKind = 'markdown' | 'html' | 'pdf'
export interface WorkspaceTab {
  id: string
  kind: FileKind
  label: string
  path: string | null
  text: string
  savedText: string | null
  lineEnding: 'lf' | 'crlf'
  bom: boolean
  data?: Uint8Array
  mode: PreviewMode
  editing: 'live' | 'source'
  layout: 'editor' | 'split' | 'preview'
  slide: number
  pdfPage: number
  themeCss: string
}

export interface FolderEntry { name: string; path: string; directory: boolean }
export interface Folder { path: string; name: string }

export function kindForPath(path: string): FileKind {
  return /\.pdf$/i.test(path) ? 'pdf' : /\.html?$/i.test(path) ? 'html' : 'markdown'
}

export function newTab(text: string, label: string, opened?: OpenDocument): WorkspaceTab {
  const kind = opened?.kind || 'markdown'
  return {
    id: crypto.randomUUID(), kind, label, path: opened?.path || null, text,
    savedText: text, lineEnding: opened?.lineEnding || 'lf', bom: opened?.bom || false,
    data: opened?.data ? decodeBase64(opened.data) : undefined,
    mode: 'auto', editing: 'live', layout: kind !== 'markdown' ? 'preview' : /^marp\s*:\s*true\s*$/m.test(text) ? 'split' : 'editor',
    slide: 0, pdfPage: 1, themeCss: '',
  }
}

export function tabForDocument(opened: OpenDocument): WorkspaceTab { return newTab(opened.text, fileName(opened.path), opened) }
export function isDirty(tab: WorkspaceTab): boolean { return tab.kind === 'markdown' && tab.text !== tab.savedText }

export function decodeBase64(data: string): Uint8Array {
  const decoded = atob(data)
  return Uint8Array.from(decoded, character => character.charCodeAt(0))
}

export interface EditorSnapshot { state: EditorState; top: number; left: number }
/** Keep state/history without keeping a DOM editor per inactive tab. */
export class EditorSessions {
  private readonly sessions = new Map<string, EditorSnapshot>()
  set(id: string, snapshot: EditorSnapshot) { this.sessions.set(id, snapshot) }
  get(id: string) { return this.sessions.get(id) }
  retain(ids: readonly string[]) { const keep = new Set(ids); for (const id of this.sessions.keys()) if (!keep.has(id)) this.sessions.delete(id) }
}

export interface DraftSession { activeId: string; tabs: Array<Pick<WorkspaceTab, 'id' | 'label' | 'text' | 'lineEnding' | 'bom' | 'editing'>> }
export const draftKey = 'marpora.session.v2'
export function serializeDrafts(tabs: readonly WorkspaceTab[], activeId: string): DraftSession {
  return { activeId, tabs: tabs.filter(isDirty).map(({ id, label, text, lineEnding, bom, editing }) => ({ id, label, text, lineEnding, bom, editing })) }
}

export function restoreDrafts(value: unknown): WorkspaceTab[] {
  if (!value || typeof value !== 'object' || !('tabs' in value) || !Array.isArray(value.tabs)) return []
  return value.tabs.filter(item => item && typeof item.text === 'string' && typeof item.label === 'string').slice(0, 100).map(item => ({
    ...newTab(item.text, item.label), id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), savedText: null,
    lineEnding: item.lineEnding === 'crlf' ? 'crlf' : 'lf', bom: item.bom === true, editing: item.editing === 'source' ? 'source' : 'live',
  }))
}
