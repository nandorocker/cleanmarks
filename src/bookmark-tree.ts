import type { Bookmarks } from 'webextension-polyfill'
import type { FlatBookmark } from './types'

export type BookmarkNode = Bookmarks.BookmarkTreeNode

export function pruneTree(nodes: BookmarkNode[], excludedId?: string): BookmarkNode[] {
  return nodes.filter(node => node.id !== excludedId).map(node => ({
    ...node,
    ...(node.children ? { children: pruneTree(node.children, excludedId) } : {}),
  }))
}

// Explicit folder choices inherit to new descendants, including folders created
// while the sidebar is open. A child can override an ancestor's choice.
export function resolveFolders(nodes: BookmarkNode[], defaultSelected: boolean, overrides: Map<string, boolean>): Set<string> {
  const selected = new Set<string>()
  function visit(nodes: BookmarkNode[], inherited: boolean): void {
    for (const node of nodes) {
      if (node.url) continue
      const included = overrides.get(node.id) ?? inherited
      if (included) selected.add(node.id)
      visit(node.children ?? [], included)
    }
  }
  visit(nodes, defaultSelected)
  return selected
}

export function collectBookmarks(nodes: BookmarkNode[], folders: Set<string> | null = null): FlatBookmark[] {
  const results: FlatBookmark[] = []
  function visit(node: BookmarkNode, included: boolean, path: string[]): void {
    included ||= folders === null || folders.has(node.id)
    if (node.url && included) {
      try {
        if (!['http:', 'https:'].includes(new URL(node.url).protocol)) return
      } catch { return }
      results.push({ id: node.id, title: node.title || node.url, url: node.url,
        parentId: node.parentId, index: node.index, folderPath: path.join(' / ') })
    }
    for (const child of node.children ?? []) visit(child, included, node.title ? [...path, node.title] : path)
  }
  for (const node of nodes) visit(node, false, [])
  return results
}
