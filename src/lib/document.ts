import { parseDocument } from 'yaml'

export type PreviewMode = 'auto' | 'document' | 'slides'
export interface Frontmatter {
  body: string
  data: Record<string, unknown>
  error?: string
}

export function frontmatter(source: string): Frontmatter {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/)
  if (!match) return { body: source, data: {} }
  try {
    const doc = parseDocument(match[1], { uniqueKeys: true })
    if (doc.errors.length) throw doc.errors[0]
    const data: unknown = doc.toJS({ maxAliasCount: 50 })
    return { body: source.slice(match[0].length), data: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {} }
  } catch (error) {
    return { body: source, data: {}, error: `Front matter: ${String(error)}` }
  }
}

export function effectiveMode(source: string, mode: PreviewMode): 'document' | 'slides' {
  return mode === 'auto' ? (frontmatter(source).data.marp === true ? 'slides' : 'document') : mode
}

/** Fallback navigation ranges; Marp's renderer supplies final slide count. */
export function slideStarts(source: string): number[] {
  const header = frontmatter(source)
  const offset = source.length - header.body.length
  const starts = [offset]
  let position = offset
  let fence: string | null = null
  let comment = false
  for (const line of header.body.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (!comment && marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = null
    } else if (!fence) {
      if (!comment && /^ {0,3}(?:-{3,}|\*\*\*+|___+)\s*$/.test(line)) starts.push(position + line.length + 1)
      for (const token of line.matchAll(/<!--|-->/g)) comment = token[0] === '<!--'
    }
    position += line.length + 1
  }
  return starts
}

export function fileName(path: string | null): string {
  return path?.split(/[\\/]/).pop() || '未命名.md'
}

export function characterCount(source: string): number {
  return Array.from(source.replace(/\s/g, '')).length
}
