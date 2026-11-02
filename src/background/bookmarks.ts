// src/background/bookmarks.ts
import type { Bookmarks } from 'webextension-polyfill'
import type { FlatBookmark } from '../types'
import Browser from 'webextension-polyfill'

declare const __IS_CHROME__: boolean

export function flattenBookmarks(nodes: Bookmarks.BookmarkTreeNode[]): FlatBookmark[] {
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
  // Use chrome directly on Chrome, polyfill on Firefox
  const browser = __IS_CHROME__
    ? (chrome as any)
    : Browser
  const tree = await browser.bookmarks.getTree()
  return flattenBookmarks(tree)
}
