// src/background/bookmarks.ts
import type { BookmarkTreeNode } from 'webextension-polyfill'
import type { FlatBookmark } from '../types'

export function flattenBookmarks(nodes: BookmarkTreeNode[]): FlatBookmark[] {
  const results: FlatBookmark[] = []
  for (const node of nodes) {
    if (node.url) {
      results.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
      })
    }
    if (node.children) {
      results.push(...flattenBookmarks(node.children))
    }
  }
  return results
}

export async function getAllBookmarks(): Promise<FlatBookmark[]> {
  const browser = typeof globalThis !== 'undefined' && 'browser' in globalThis
    ? (globalThis as any).browser
    : await import('webextension-polyfill').then(m => m.default)
  const tree = await browser.bookmarks.getTree()
  return flattenBookmarks(tree)
}
