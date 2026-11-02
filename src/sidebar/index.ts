import browser from 'webextension-polyfill'
import { Scanner } from '../background/scanner'
import { quarantineId } from '../background/cleanup'
import { collectBookmarks, pruneTree, resolveFolders } from '../bookmark-tree'
import { loadSettings } from '../settings'
import { createState, applyMessage, selectRange } from './state'
import { renderApp, updateFolderSelection } from './ui'
import type { AppView } from './ui'
import type { CleanupMode, CleanupOutcome } from '../types'

let state = createState()
const view: AppView = { screen: 'folders', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(['dead']),
  mode: 'move', busy: false, loading: true, notice: '', confirm: false }
let scanner: Scanner | null = null
let generation = 0
let anchor: string | null = null
let allFolders = true
const folderOverrides = new Map<string, boolean>()
let renderTimer: ReturnType<typeof setTimeout> | undefined
const root = document.getElementById('app')!

function render(): void { renderApp(root, state, view) }
function scheduleRender(): void {
  if (renderTimer === undefined) renderTimer = setTimeout(() => { renderTimer = undefined; render() }, 80)
}
function folderIds(id: string): string[] {
  const ids: string[] = []
  function visit(nodes: AppView['tree'], include: boolean): void {
    for (const node of nodes) {
      const included = include || node.id === id
      if (!node.url && included) ids.push(node.id)
      visit(node.children ?? [], included)
    }
  }
  visit(view.tree, false)
  return ids
}
async function loadTree(): Promise<void> {
  view.tree = pruneTree(await browser.bookmarks.getTree(), await quarantineId())
  view.folders = resolveFolders(view.tree, allFolders, folderOverrides)
}
async function scan(): Promise<void> {
  if (view.busy) return
  scanner?.cancel()
  const current = ++generation
  state = { ...createState(), phase: 'scanning', lastScanDate: state.lastScanDate }
  view.screen = 'results'
  view.notice = ''
  anchor = null
  render()
  try {
    await loadTree()
    const settings = await loadSettings()
    if (current !== generation) return
    const bookmarks = collectBookmarks(view.tree).filter(b => b.parentId && view.folders.has(b.parentId))
    state.progress = { checked: 0, total: bookmarks.length }
    const active = new Scanner(settings)
    scanner = active
    active.on('result', result => {
      if (current !== generation) return
      // State is local to this panel; avoid copying a growing array per result.
      state.results.push(result)
      if (result.status === 'dead') state.selected.add(result.bookmark.id)
      scheduleRender()
    })
    active.on('progress', checked => {
      if (current === generation) { state.progress.checked = checked; scheduleRender() }
    })
    render()
    await active.run(bookmarks)
    if (current !== generation) return
    scanner = null
    state = { ...state, phase: 'done', lastScanDate: new Date().toLocaleString() }
    render()
  } catch (error) {
    if (current !== generation) return
    state = applyMessage(state, { type: 'scan_error', error: String(error) })
    render()
  }
}

root.addEventListener('click', async event => {
  const target = event.target as HTMLElement
  if (target.closest('a')) return
  const button = target.closest<HTMLButtonElement>('button[data-action]')
  if (!button || button.disabled) return
  const action = button.dataset.action
  if (action === 'scan') { void scan(); return }
  if (action === 'cancel' || action === 'folders') {
    ++generation; scanner?.cancel(); scanner = null
    state = { ...createState(), lastScanDate: state.lastScanDate }
    view.screen = 'folders'
    view.notice = ''
    view.confirm = false
  }
  if (action === 'expand') {
    const id = button.dataset.id!
    if (view.expanded.has(id)) view.expanded.delete(id)
    else view.expanded.add(id)
  }
  if (action === 'section') {
    const status = button.dataset.status!
    if (view.sections.has(status)) view.sections.delete(status)
    else view.sections.add(status)
  }
  if (action === 'all' || action === 'none') {
    state = selectRange(state, state.results.filter(r => r.status !== 'alive').map(r => r.bookmark.id), action === 'all')
    anchor = null
  }
  if (action === 'folders-all' || action === 'folders-none') {
    allFolders = action === 'folders-all'
    folderOverrides.clear()
    view.folders = resolveFolders(view.tree, allFolders, folderOverrides)
    updateFolderSelection(root, view)
    return
  }
  if (action === 'review') view.confirm = true
  if (action === 'dismiss') view.confirm = false
  if (action === 'replace') {
    view.busy = true; render()
    try {
      const response = await browser.runtime.sendMessage({ type: 'replace_quarantine' })
      if (response.error) throw new Error(response.error)
      view.notice = 'Created a replacement Deleted Bookmarks folder.'
    } catch (error) { view.notice = String(error) }
    view.busy = false
  }
  if (action === 'confirm' && !view.busy) {
    const bookmarks = state.results.filter(r => r.status !== 'alive' && state.selected.has(r.bookmark.id)).map(r => r.bookmark)
    const mode = view.mode
    view.confirm = false; view.busy = true; view.notice = ''; render()
    try {
      const response: { outcome?: CleanupOutcome; error?: string } = await browser.runtime.sendMessage({ type: 'cleanup', mode, bookmarks })
      if (!response.outcome) throw new Error(response.error || 'Cleanup did not return a result. Scan again before retrying.')
      const outcome = response.outcome
      const succeeded = new Set(outcome.succeeded)
      state.results = state.results.filter(r => !succeeded.has(r.bookmark.id))
      state.selected = new Set([...state.selected].filter(id => !succeeded.has(id)))
      view.notice = `${succeeded.size} bookmark(s) ${mode === 'move' ? 'moved to Deleted Bookmarks' : 'permanently deleted'}. ${outcome.failed.length} failed. ${outcome.failed.map(f => f.error).join(' ')} ${outcome.warning ?? ''}`
    } catch (error) { view.notice = `${String(error)} No unconfirmed changes have been removed from this list.` }
    finally { view.busy = false }
  }
  render()
})

root.addEventListener('click', event => {
  const input = event.target as HTMLInputElement
  if (!input.matches('input[data-bookmark]') || view.busy) return
  const id = input.dataset.bookmark!
  // Follow the visible row order, including ranges across expanded categories.
  const ids = [...root.querySelectorAll<HTMLInputElement>('input[data-bookmark]')].map(input => input.dataset.bookmark!)
  const a = anchor ? ids.indexOf(anchor) : -1
  const b = ids.indexOf(id)
  const range = (event as MouseEvent).shiftKey && a >= 0 ? ids.slice(Math.min(a, b), Math.max(a, b) + 1) : [id]
  state = selectRange(state, range, input.checked)
  anchor = id
  render()
})
root.addEventListener('change', event => {
  const input = event.target as HTMLInputElement
  if (input.disabled || view.busy || state.phase === 'scanning') return
  if (input.dataset.folder) {
    for (const id of folderIds(input.dataset.folder)) {
      folderOverrides.delete(id)
    }
    folderOverrides.set(input.dataset.folder, input.checked)
    view.folders = resolveFolders(view.tree, allFolders, folderOverrides)
    // Keep the actual tree nodes mounted: replacing focused/scrolled controls
    // can trigger native scroll anchoring even if scrollTop is restored.
    updateFolderSelection(root, view)
    return
  }
  if (input.id === 'delete-mode') {
    view.mode = input.checked ? 'delete' : 'move' satisfies CleanupMode
    render()
  }
})
root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && view.confirm) { view.confirm = false; render() }
  if (event.key === 'Tab' && view.confirm) {
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('dialog button')]
    const first = buttons[0], last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
})
window.addEventListener('pagehide', () => { ++generation; scanner?.cancel(); clearTimeout(renderTimer) })
render()
void loadTree().catch(error => { state = { ...state, phase: 'error', error: String(error) } }).finally(() => { view.loading = false; render() })
