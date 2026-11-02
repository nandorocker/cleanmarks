import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkNode } from '../../src/bookmark-tree'
const mocks = vi.hoisted(() => ({ getTree: vi.fn(), get: vi.fn(), create: vi.fn(), move: vi.fn(), remove: vi.fn(), storageGet: vi.fn(), set: vi.fn() }))
vi.mock('webextension-polyfill', () => ({ default: {
  bookmarks: { getTree: mocks.getTree, get: mocks.get, create: mocks.create, move: mocks.move, remove: mocks.remove },
  storage: { local: { get: mocks.storageGet, set: mocks.set } },
} }))
import { cleanup, QUARANTINE_KEY } from '../../src/background/cleanup'

let store: Record<string, unknown>
let nodes: BookmarkNode[]
const bookmark = (id = '1') => ({ id, title: 'Link', url: `https://${id}.example`, parentId: 'folder' })
beforeEach(() => {
  vi.resetAllMocks()
  store = {}
  nodes = [{ id: 'root', title: '', children: [{ id: 'folder', parentId: 'root', title: 'Folder', children: [
    { ...bookmark(), index: 0 }, { ...bookmark('2'), index: 1 },
  ] }] }]
  mocks.storageGet.mockImplementation(async (key: string) => ({ [key]: store[key] }))
  mocks.set.mockImplementation(async (value: Record<string, unknown>) => { Object.assign(store, structuredClone(value)) })
  mocks.getTree.mockImplementation(async () => structuredClone(nodes))
  const find = (id: string, children = nodes): BookmarkNode | undefined => {
    for (const n of children) { if (n.id === id) return n; const found = find(id, n.children ?? []); if (found) return found }
  }
  mocks.get.mockImplementation(async (id: string) => { const node = find(id); if (!node) throw new Error('Missing'); return [structuredClone(node)] })
  mocks.create.mockImplementation(async () => { const folder = { id: 'trash', title: 'Deleted Bookmarks', parentId: 'root', children: [] }; nodes[0]!.children!.push(folder); return folder })
  mocks.move.mockImplementation(async (id: string, { parentId }: { parentId: string }) => { find(id)!.parentId = parentId })
  mocks.remove.mockResolvedValue(undefined)
})

describe('cleanup safety', () => {
  it('persists identity and original locations before moving; deduplicates selection', async () => {
    mocks.move.mockImplementation(async () => {
      expect(store[QUARANTINE_KEY]).toBe('trash')
      const journal = Object.values(store).find(v => typeof v === 'object') as { items: { originalParentId: string; originalIndex: number }[] }
      expect(journal.items.map(i => i.originalIndex)).toEqual([0, 1])
      expect(journal.items[0]!.originalParentId).toBe('folder')
    })
    const outcome = await cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark(), bookmark(), bookmark('2')] })
    expect(outcome.succeeded).toEqual(['1', '2'])
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.move).toHaveBeenCalledTimes(2)
  })
  it('moves nothing if the write-ahead journal cannot be saved', async () => {
    mocks.set.mockImplementation(async (value: Record<string, unknown>) => {
      if (Object.keys(value)[0]!.startsWith('cleanup_')) throw new Error('Storage full')
      Object.assign(store, value)
    })
    await expect(cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark()] })).rejects.toThrow('Storage full')
    expect(mocks.move).not.toHaveBeenCalled()
  })
  it('does not move sources if folder identity cannot be saved', async () => {
    mocks.set.mockRejectedValue(new Error('Storage full'))
    await expect(cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark()] })).rejects.toThrow()
    expect(mocks.move).not.toHaveBeenCalled()
  })
  it('retains failures and records successes separately', async () => {
    mocks.move.mockRejectedValueOnce(new Error('Permission denied')).mockResolvedValueOnce(undefined)
    const outcome = await cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark(), bookmark('2')] })
    expect(outcome.succeeded).toEqual(['2'])
    expect(outcome.failed[0]!.id).toBe('1')
  })
  it('stops subsequent moves when post-move recording fails', async () => {
    mocks.set.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Full'))
    const outcome = await cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark(), bookmark('2')] })
    expect(outcome.succeeded).toEqual(['1'])
    expect(outcome.warning).toContain('stopped')
    expect(mocks.move).toHaveBeenCalledTimes(1)
  })
  it('rejects stale URLs and folders without mutating them', async () => {
    const outcome = await cleanup({ type: 'cleanup', mode: 'delete', bookmarks: [{ ...bookmark(), url: 'https://changed.example' }, { ...bookmark(), id: 'folder' }] })
    expect(outcome.failed).toHaveLength(2)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('uses the stored quarantine identity, not a folder name', async () => {
    store[QUARANTINE_KEY] = 'folder'
    const outcome = await cleanup({ type: 'cleanup', mode: 'delete', bookmarks: [bookmark()] })
    expect(outcome.failed).toHaveLength(1)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('requires explicit replacement of a missing destination', async () => {
    store[QUARANTINE_KEY] = 'missing'
    await expect(cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark()] })).rejects.toThrow('replacement')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('serializes batches so a bookmark is not moved twice', async () => {
    const [first, second] = await Promise.all([1, 2].map(() => cleanup({ type: 'cleanup', mode: 'move', bookmarks: [bookmark()] })))
    expect(first!.succeeded).toEqual(['1'])
    expect(second!.succeeded).toEqual([])
    expect(mocks.move).toHaveBeenCalledTimes(1)
  })
  it('permanently removes only explicitly requested URL bookmarks', async () => {
    const outcome = await cleanup({ type: 'cleanup', mode: 'delete', bookmarks: [bookmark()] })
    expect(outcome.succeeded).toEqual(['1'])
    expect(mocks.remove).toHaveBeenCalledWith('1')
    expect(mocks.move).not.toHaveBeenCalled()
  })
})
