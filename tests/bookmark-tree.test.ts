import { describe, it, expect } from 'vitest'
import { collectBookmarks, pruneTree, resolveFolders } from '../src/bookmark-tree'
import type { BookmarkNode } from '../src/bookmark-tree'

const tree: BookmarkNode[] = [{ id: 'root', title: '', children: [
  { id: 'a', title: 'Work', children: [
    { id: '1', parentId: 'a', index: 0, title: 'Link', url: 'https://example.com' },
    { id: 'b', title: 'Nested', children: [
      { id: '2', parentId: 'b', title: 'Nested link', url: 'https://nested.example' },
    ] },
    { id: '3', title: 'Script', url: 'javascript:alert(1)' },
    { id: '4', title: 'Invalid', url: 'broken url' },
  ] },
  { id: 'trash', title: 'Renamed folder', children: [{ id: '5', title: 'Deleted', url: 'https://deleted.example' }] },
] }]

describe('bookmark scope', () => {
  it('keeps new folders in all scope and inherits explicit ancestor choices', () => {
    const updated = structuredClone(tree)
    updated[0]!.children![0]!.children!.push({ id: 'new', title: 'New folder' })
    expect(resolveFolders(updated, true, new Map()).has('new')).toBe(true)
    expect(resolveFolders(updated, false, new Map([['a', true]])).has('new')).toBe(true)
    expect(resolveFolders(updated, true, new Map([['a', false]])).has('new')).toBe(false)
    expect(resolveFolders(updated, true, new Map([['a', false], ['new', true]])).has('new')).toBe(true)
  })
  it('defaults to all HTTP(S) links with original locations', () => {
    expect(collectBookmarks(tree).map(b => b.id)).toEqual(['1', '2', '5'])
    expect(collectBookmarks(tree)[0]).toMatchObject({ parentId: 'a', index: 0, folderPath: 'Work' })
  })
  it('includes descendants once for overlapping folder choices', () => {
    expect(collectBookmarks(tree, new Set(['a', 'b'])).map(b => b.id)).toEqual(['1', '2'])
    expect(collectBookmarks(tree, new Set()).length).toBe(0)
  })
  it('prunes quarantine by identity before selecting any scope', () => {
    expect(collectBookmarks(pruneTree(tree, 'trash')).map(b => b.id)).toEqual(['1', '2'])
    expect(collectBookmarks(pruneTree(tree, 'trash'), new Set(['trash']))).toEqual([])
  })
})
