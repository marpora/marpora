<script lang="ts">
  import FolderTree from './FolderTree.svelte'
  import { listFolder } from '../lib/folders'
  import type { FolderEntry } from '../lib/workspace'
  import { translator, type Language } from '../lib/i18n'
  let { root, path, activePath, language, onopen }: { root: string; path: string; activePath: string | null; language: Language; onopen: (path: string) => void } = $props()
  let children = $state<FolderEntry[]>([])
  let expanded = $state<string[]>([])
  let loading = $state(true)
  let error = $state('')
  const t = $derived(translator(language))
  $effect(() => {
    const current = path
    let disposed = false
    loading = true
    void listFolder(root, current).then(entries => { if (!disposed) children = entries }).catch(cause => { if (!disposed) error = String(cause) }).finally(() => { if (!disposed) loading = false })
    return () => { disposed = true }
  })
</script>

{#if loading}<p class="folder-empty">{t('loading')}</p>
{:else if error}<p class="folder-empty" role="alert">{error}</p>
{:else if !children.length}<p class="folder-empty">{t('emptyFolder')}</p>
{:else}
  <ul class="folder-tree">
    {#each children as entry (entry.path)}
      <li>
        <button class:active={activePath === entry.path} class="folder-entry" title={entry.path} aria-expanded={entry.directory ? expanded.includes(entry.path) : undefined} onclick={() => entry.directory ? expanded = expanded.includes(entry.path) ? expanded.filter(path => path !== entry.path) : [...expanded, entry.path] : onopen(entry.path)}>
          {#if entry.directory}<svg viewBox="0 0 20 20" aria-hidden="true"><path d={expanded.includes(entry.path) ? 'm5 7 5 5 5-5' : 'm7 5 5 5-5 5'}/></svg><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 6V4h6l2 2h8v10H2Z"/></svg>
          {:else}<span class="file-kind" aria-hidden="true">{entry.name.match(/\.([^.]+)$/)?.[1].toLowerCase() === 'pdf' ? 'P' : /\.html?$/i.test(entry.name) ? 'H' : '#'}</span>{/if}
          <span class="entry-name">{entry.name}</span>
        </button>
        {#if entry.directory && expanded.includes(entry.path)}<FolderTree {root} path={entry.path} {activePath} {language} {onopen}/>{/if}
      </li>
    {/each}
  </ul>
{/if}
