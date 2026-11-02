import browser from 'webextension-polyfill'
import type { CleanupRequest, CleanupOutcome, FlatBookmark } from '../types'
import type { BookmarkNode } from '../bookmark-tree'

export const QUARANTINE_KEY = 'deleted_bookmarks_folder'
let pending: Promise<unknown> = Promise.resolve()

export async function quarantineId(): Promise<string | undefined> {
  const stored = await browser.storage.local.get(QUARANTINE_KEY)
  return stored[QUARANTINE_KEY] as string | undefined
}

export function cleanup(request: CleanupRequest): Promise<CleanupOutcome> {
  const operation = pending.then(() => performCleanup(request))
  pending = operation.catch(() => {})
  return operation
}

async function performCleanup(request: CleanupRequest): Promise<CleanupOutcome> {
  if (!['move', 'delete'].includes(request.mode) || !Array.isArray(request.bookmarks)) throw new Error('Invalid cleanup request')
  const outcome: CleanupOutcome = { succeeded: [], failed: [] }
  let destination = await quarantineId()
  const tree = await browser.bookmarks.getTree()
  const nodes = new Map<string, BookmarkNode>()
  function index(node: BookmarkNode): void {
    nodes.set(node.id, node)
    node.children?.forEach(index)
  }
  tree.forEach(index)
  const insideQuarantine = (node: BookmarkNode): boolean => {
    const seen = new Set<string>()
    while (true) {
      if (node.id === destination) return true
      if (!node.parentId || seen.has(node.id)) return false
      seen.add(node.id)
      const parent = nodes.get(node.parentId)
      if (!parent) return false
      node = parent
    }
  }
  const snapshots: { bookmark: FlatBookmark; node: BookmarkNode; state: string; error?: string }[] = []
  for (const bookmark of new Map(request.bookmarks.map(b => [b.id, b])).values()) {
    const node = nodes.get(bookmark.id)
    if (!node?.url || !node.parentId || node.url !== bookmark.url || node.parentId !== bookmark.parentId || insideQuarantine(node)) {
      outcome.failed.push({ id: bookmark.id, error: 'Bookmark changed, disappeared, or is already in Deleted Bookmarks. Scan again.' })
    } else snapshots.push({ bookmark, node, state: 'prepared' })
  }
  if (!snapshots.length) return outcome
  if (request.mode === 'move') {
    if (destination && (!nodes.has(destination) || nodes.get(destination)?.url)) {
      throw new Error('Deleted Bookmarks folder is missing. Choose “Create replacement folder” before trying again.')
    }
    if (!destination) {
      const folder = await browser.bookmarks.create({ title: 'Deleted Bookmarks' })
      destination = folder.id
      // No source may move before this identity is durably saved.
      await browser.storage.local.set({ [QUARANTINE_KEY]: destination })
    }
  }
  const journalKey = `cleanup_${crypto.randomUUID()}`
  const journal = { version: 1, mode: request.mode, destinationId: destination, createdAt: Date.now(),
    items: snapshots.map(({ node, state }) => ({ id: node.id, title: node.title, url: node.url,
      originalParentId: node.parentId, originalIndex: node.index, state, error: undefined as string | undefined })) }
  await browser.storage.local.set({ [journalKey]: journal })
  for (const [i, snapshot] of snapshots.entries()) {
    const item = journal.items[i]!
    try {
      const [live] = await browser.bookmarks.get(snapshot.node.id)
      if (!live || live.url !== snapshot.node.url || live.parentId !== snapshot.node.parentId) throw new Error('Bookmark changed. Scan again.')
      // Re-read ancestry: a whole parent folder may have moved since the scan.
      let parentId = live.parentId
      while (parentId) {
        if (parentId === destination) throw new Error('Bookmark is already in Deleted Bookmarks')
        const [parent] = await browser.bookmarks.get(parentId)
        parentId = parent?.parentId
      }
      if (request.mode === 'move') {
        const [folder] = await browser.bookmarks.get(destination!)
        if (!folder || folder.url) throw new Error('Deleted Bookmarks folder is unavailable')
        await browser.bookmarks.move(live.id, { parentId: destination })
      } else await browser.bookmarks.remove(live.id)
      item.state = request.mode === 'move' ? 'moved' : 'deleted'
      outcome.succeeded.push(live.id)
    } catch (err) {
      item.state = 'failed'
      item.error = String(err)
      outcome.failed.push({ id: item.id, error: item.error })
    }
    // Keep the original batch snapshot immutable; write only this outcome rather
    // than serializing every bookmark again after each individual mutation.
    try { await browser.storage.local.set({ [`${journalKey}_result_${item.id}`]: {
      id: item.id, state: item.state, error: item.error,
    } }) } catch {
      outcome.warning = 'Cleanup stopped because its recovery record could not be updated. Completed changes are listed; unprocessed bookmarks remain selected.'
      break
    }
  }
  return outcome
}

export async function replaceQuarantine(): Promise<void> {
  const operation = pending.then(async () => {
    const id = await quarantineId()
    if (id) {
      const tree = await browser.bookmarks.getTree()
      const exists = (nodes: BookmarkNode[]): boolean => nodes.some(n => n.id === id || exists(n.children ?? []))
      if (exists(tree)) throw new Error('The existing Deleted Bookmarks folder is still available.')
    }
    const folder = await browser.bookmarks.create({ title: 'Deleted Bookmarks' })
    await browser.storage.local.set({ [QUARANTINE_KEY]: folder.id })
  })
  pending = operation.catch(() => {})
  return operation
}
