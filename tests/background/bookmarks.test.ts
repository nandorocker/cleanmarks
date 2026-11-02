// tests/background/bookmarks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flattenBookmarks } from '../../src/background/bookmarks'
import type { Bookmarks } from 'webextension-polyfill'
type BookmarkTreeNode = Bookmarks.BookmarkTreeNode
vi.mock('webextension-polyfill', () => ({ default: {} }))

// We test the pure flatten logic — no browser API needed
describe('flattenBookmarks', () => {
  it('returns empty array for empty tree', () => {
    expect(flattenBookmarks([])).toEqual([])
  })

  it('extracts a single bookmark', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'My Site', url: 'https://example.com'
      }]
    }]
    expect(flattenBookmarks(tree)).toEqual([
      { id: '2', title: 'My Site', url: 'https://example.com' }
    ])
  })

  it('skips folders (no url)', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'Folder', children: []
      }]
    }]
    expect(flattenBookmarks(tree)).toEqual([])
  })

  it('flattens nested folders', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'Folder', children: [{
          id: '3', title: 'Nested', url: 'https://nested.com'
        }]
      }]
    }]
    const result = flattenBookmarks(tree)
    expect(result).toHaveLength(1)
    expect(result[0]?.url).toBe('https://nested.com')
  })

  it('skips bookmarks with no title (uses url as fallback title)', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: '', url: 'https://no-title.com'
      }]
    }]
    const result = flattenBookmarks(tree)
    expect(result[0]?.title).toBe('https://no-title.com')
  })
})
