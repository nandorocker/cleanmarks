import type { SidebarState } from './state'
import type { BookmarkNode } from '../bookmark-tree'
import type { CleanupMode } from '../types'

export interface AppView {
  screen: 'folders' | 'results'
  folderScroll?: number
  tree: BookmarkNode[]
  folders: Set<string>
  expanded: Set<string>
  sections: Set<string>
  mode: CleanupMode
  busy: boolean
  loading: boolean
  notice: string
  confirm: boolean
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function updateFolderSelection(root: HTMLElement, view: AppView): void {
  const inputs = root.querySelectorAll<HTMLInputElement>('input[data-folder]')
  if (!inputs.length) return
  const folderCounts = new Map<string, { total: number; selected: number }>()
  function countFolders(nodes: BookmarkNode[]): { total: number; selected: number } {
    let total = 0, selected = 0
    for (const node of nodes) {
      if (node.url) continue
      const children = countFolders(node.children ?? [])
      const counts = { total: children.total + 1, selected: children.selected + Number(view.folders.has(node.id)) }
      folderCounts.set(node.id, counts)
      total += counts.total; selected += counts.selected
    }
    return { total, selected }
  }
  countFolders(view.tree)
  for (const input of inputs) {
    const counts = folderCounts.get(input.dataset.folder!)!
    input.checked = counts.selected === counts.total
    input.indeterminate = counts.selected > 0 && counts.selected < counts.total
  }
}

export function renderApp(root: HTMLElement, state: SidebarState, view: AppView): void {
  const changedScreen = root.dataset.screen !== view.screen
  root.dataset.screen = view.screen
  const focused = (document.activeElement as HTMLElement | null)?.dataset.focus
  const scroll = root.querySelector('#results')?.scrollTop ?? 0
  const hadDialog = !!root.querySelector('dialog')
  view.folderScroll = root.querySelector('.folder-tree')?.scrollTop ?? view.folderScroll ?? 0
  const pageScroll = document.scrollingElement?.scrollTop ?? 0
  const locked = view.busy || state.phase === 'scanning'
  const disabled = locked ? 'disabled' : ''
  const dead = state.results.filter(r => r.status === 'dead')
  const uncertain = state.results.filter(r => r.status === 'unreachable')
  const moved = state.results.filter(r => r.status === 'moved')
  const reviewCount = dead.length + uncertain.length + moved.length
  const selectedUncertain = uncertain.filter(r => state.selected.has(r.bookmark.id)).length
  const selectedMoved = moved.filter(r => state.selected.has(r.bookmark.id)).length
  function folders(nodes: BookmarkNode[]): string {
    return nodes.filter(n => !n.url).map(node => {
      if (!node.title && !node.parentId) return folders(node.children ?? [])
      const childFolders = (node.children ?? []).filter(n => !n.url)
      const expanded = view.expanded.has(node.id)
      return `<li><div class="folder-row">
        <button class="expand" data-action="expand" data-id="${escape(node.id)}" data-focus="expand-${escape(node.id)}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escape(node.title)}" aria-expanded="${expanded}" ${!childFolders.length ? 'disabled' : ''}>${childFolders.length ? (expanded ? '▾' : '▸') : '·'}</button>
        <label><input type="checkbox" data-folder="${escape(node.id)}" data-focus="folder-${escape(node.id)}" ${disabled}> ${escape(node.title)}</label></div>
        ${expanded ? `<ul>${folders(childFolders)}</ul>` : ''}</li>`
    }).join('')
  }
  function section(status: string, title: string, results: typeof dead): string {
    if (!results.length) return ''
    const expanded = view.sections.has(status)
    return `<section><h2><button data-action="section" data-status="${status}" data-focus="section-${status}" aria-expanded="${expanded}">${expanded ? '▾' : '▸'} ${title} <span>${results.length}</span></button></h2>
      ${expanded ? results.map(result => `<div class="bookmark-row">
        <input aria-label="Select ${escape(result.bookmark.title)}" type="checkbox" data-bookmark="${escape(result.bookmark.id)}" data-focus="bookmark-${escape(result.bookmark.id)}" ${state.selected.has(result.bookmark.id) ? 'checked' : ''} ${view.busy ? 'disabled' : ''}>
        <div class="bookmark-info"><a href="${escape(result.bookmark.url)}" target="_blank" rel="noopener noreferrer" title="${escape(result.bookmark.url)}">${escape(result.bookmark.title)}</a>
        <div class="muted truncate">${escape(result.bookmark.url)}</div>
        <div class="muted">${escape(result.bookmark.folderPath ?? '')}</div>
        ${result.redirectUrl ? `<div class="muted">Redirects to ${escape(result.redirectUrl)}</div>` : ''}
        <div class="reason">${result.statusCode ?? ''} ${escape(result.error ?? (status === 'dead' ? 'Page not found — may be temporary' : ''))}</div></div></div>`).join('') : ''}</section>`
  }
  const notice = `${state.error ? `<p role="alert" class="notice">${escape(state.error)}</p>` : ''}
    ${view.notice ? `<p role="status" class="notice">${escape(view.notice)}</p>${view.notice.includes('Create replacement folder') ? '<button data-action="replace" '+disabled+'>Create replacement folder</button>' : ''}` : ''}`
  const setup = view.screen === 'folders' ? `<section class="setup-screen">
      <div class="controls"><button data-action="folders-all" ${disabled}>Select all</button><button data-action="folders-none" ${disabled}>Select none</button></div>
      <ul class="folder-tree" aria-label="Folders to scan">${folders(view.tree)}</ul>
      ${notice}
      <footer><button class="primary" data-action="scan" data-focus="scan" ${view.loading ? 'disabled' : ''}>${view.loading ? 'Loading folders…' : 'Scan bookmarks'}</button>
      <p class="muted">Deleted Bookmarks is excluded.</p></footer></section>` : ''
  const review = view.screen === 'results' ? `<section class="review-screen" ${view.confirm ? 'inert' : ''}>
    <nav class="controls" aria-label="Scan navigation"><button data-action="${state.phase === 'scanning' ? 'cancel' : 'folders'}" data-focus="back" ${view.busy ? 'disabled' : ''}>${state.phase === 'scanning' ? 'Cancel and go back' : 'Back to folders'}</button>
    ${state.phase !== 'scanning' ? `<button data-action="scan" data-focus="scan" ${view.busy ? 'disabled' : ''}>${state.phase === 'error' ? 'Retry scan' : 'Scan again'}</button>` : ''}</nav>
    <div role="status" aria-live="polite">${state.phase === 'scanning' ? `<p>Checking ${state.progress.checked} / ${state.progress.total}</p><progress max="${state.progress.total || 1}" value="${state.progress.checked}"></progress><p class="muted">Keep this sidebar open while scanning.</p>` : ''}</div>
    ${notice}
    ${state.phase === 'done' ? `<div class="summary">${dead.length} likely dead · ${uncertain.length} couldn’t verify · ${moved.length} redirected
      ${!state.results.length ? '<p>No HTTP(S) bookmarks in the selected folders.</p>' : ''}
      ${state.results.length && !dead.length && !uncertain.length && !moved.length ? '<p>No broken links found.</p>' : ''}</div>` : ''}
    <div id="results">${state.phase === 'done' ? `${reviewCount ? `<div class="controls"><button data-action="all" data-focus="all" ${disabled}>Select all</button><button data-action="none" data-focus="none" ${disabled}>Select none</button><span class="muted">Shift-click selects a range</span></div>` : ''}${section('dead', 'Likely dead', dead)}${section('unreachable', 'Couldn’t verify', uncertain)}${section('moved', 'Redirected', moved)}` : ''}</div>
    ${state.phase === 'done' && reviewCount ? `<footer><label><input id="delete-mode" data-focus="delete-mode" type="checkbox" ${view.mode === 'delete' ? 'checked' : ''} ${disabled}> Delete permanently instead of moving</label>
      <button class="${view.mode === 'delete' ? 'danger' : 'primary'}" data-action="review" data-focus="review" ${!state.selected.size || view.busy ? 'disabled' : ''}>${view.busy ? 'Working…' : `${view.mode === 'delete' ? 'Delete' : 'Move'} ${state.selected.size} bookmark(s)`}</button>
      <p class="muted">${view.mode === 'move' ? 'Moves to Deleted Bookmarks. You can move them back in your bookmark manager.' : 'Permanent deletion cannot be undone.'}</p></footer>` : ''}</section>` : ''
  root.innerHTML = `<header><p class="step">Step ${view.screen === 'folders' ? '1' : '2'} of 2</p><h1 tabindex="-1">${view.screen === 'folders' ? 'Choose folders' : state.phase === 'scanning' ? 'Checking bookmarks' : 'Review results'}</h1>
    ${view.screen === 'folders' ? '<p class="muted">Selecting a folder includes its subfolders.</p>' : ''}</header>
    ${view.screen === 'folders' ? setup : review}
    ${view.confirm ? `<dialog open aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">${view.mode === 'move' ? 'Move to Deleted Bookmarks?' : 'Permanently delete bookmarks?'}</h2><p>${state.selected.size} selected. ${view.mode === 'move' ? 'You can move these back using your browser’s bookmark manager.' : 'This cannot be undone.'}</p>
      ${selectedUncertain || selectedMoved ? `<p>Includes ${selectedUncertain} couldn’t verify and ${selectedMoved} redirected. These links are not confirmed dead.</p>` : ''}
      <div class="controls"><button data-action="dismiss">Cancel</button><button class="${view.mode === 'delete' ? 'danger' : 'primary'}" data-action="confirm">${view.mode === 'move' ? 'Confirm move' : 'Delete permanently'}</button></div></dialog>` : ''}`
  updateFolderSelection(root, view)
  const resultsElement = root.querySelector('#results')
  if (resultsElement) resultsElement.scrollTop = scroll
  const folderTree = root.querySelector('.folder-tree')
  if (folderTree) folderTree.scrollTop = view.folderScroll
  if (document.scrollingElement) document.scrollingElement.scrollTop = changedScreen ? 0 : pageScroll
  if (view.confirm) root.querySelector<HTMLButtonElement>('dialog button')?.focus()
  else if (hadDialog) root.querySelector<HTMLButtonElement>('[data-action="review"]')?.focus()
  else if (changedScreen) root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  else if (focused) [...root.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === focused)?.focus({ preventScroll: true })
}
