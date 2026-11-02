import type { SidebarState } from './state'
import type { BookmarkNode } from '../bookmark-tree'
import type { BookmarkResult, CleanupMode, FlatBookmark } from '../types'
import { animateView, animateAccordionPane } from './motion'

export interface Completion {
  mode: CleanupMode
  bookmarks: FlatBookmark[]
  remaining: number
  warning?: string
}

export interface AppView {
  screen: 'folders' | 'results' | 'complete'
  completion?: Completion
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
  motionEnabled?: boolean
  about?: boolean
  version?: string
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Full-color artwork for the success and About screens; white mark on the brand bar.
const bookmarkIcon = '<img class="app-icon" src="../../icons/icon128.png" width="128" height="128" alt="">'
const headerIcon = '<svg class="app-icon" viewBox="0 0 128 128" aria-hidden="true"><path fill="currentColor" d="M34 12h60a10 10 0 0 1 10 10v94L64 92l-40 24V22a10 10 0 0 1 10-10Z"/><path fill="none" stroke="var(--brand-bg)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" d="m45 50 14 14 24-24"/></svg>'
const iconStarburst = '<svg class="icon-starburst" viewBox="0 0 128 128" aria-hidden="true"><polygon points="64,4 76,19 94,12 97,31 116,34 109,52 124,64 109,76 116,94 97,97 94,116 76,109 64,124 52,109 34,116 31,97 12,94 19,76 4,64 19,52 12,34 31,31 34,12 52,19"/></svg>'
// Same coffee artwork used on bounce.nan.do, shared by About and completion.
const coffeeIcon = '<svg class="coffee-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 8h14l-1.5 9A2 2 0 0 1 15.52 19H8.48A2 2 0 0 1 6.5 17L5 8Z" fill="currentColor"/><path d="M5 8H4a2 2 0 0 0 0 4h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 8V5M12 8V5M16 8V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
const shareText = 'A fresh start for your bookmarks. Try Cleanmarks: https://apps.nan.do/cleanmarks'
type ReviewStatus = 'dead' | 'unreachable' | 'moved'
const statusPaths: Record<ReviewStatus, string> = {
  dead: '<path d="M8 17H6a2 2 0 0 1-2-2v-4a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v4H8Z"/><circle cx="8.5" cy="10.5" r="1.5"/><circle cx="15.5" cy="10.5" r="1.5"/><path d="m12 13-1 2h2ZM11 18v3m2-3v3"/>',
  unreachable: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  moved: '<path d="M4 4h10a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h11m-3-3 3 3-3 3"/>',
}
function statusIcon(status: ReviewStatus): string {
  return `<svg class="status-icon" data-icon="${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${statusPaths[status]}</svg>`
}
// Copyright year range: fixed start year, extended while the extension keeps shipping.
const copyStartYear = 2026
const copyYears = new Date().getFullYear() > copyStartYear ? `${copyStartYear}–${new Date().getFullYear()}` : `${copyStartYear}`

function resultReason(result: BookmarkResult): { label: string; detail: string } {
  const code = result.statusCode
  const reasons: Record<number, { label: string; detail: string }> = {
    401: { label: 'Login required', detail: 'The site requested authentication. Open the page to check it while signed in; this does not mean the bookmark is broken.' },
    403: { label: 'Access denied', detail: 'The site refused the check. It may block automated requests; this does not mean the bookmark is broken.' },
    404: { label: 'Not found', detail: 'The site reported that this page was not found. This may be temporary; open the page before removing the bookmark.' },
    410: { label: 'Gone', detail: 'The site reported that this page has been removed. Open the page to confirm before removing the bookmark.' },
    429: { label: 'Rate limited', detail: 'The site received too many requests. Try again later; this does not mean the bookmark is broken.' },
  }
  if (code !== undefined) {
    const reason = reasons[code] ?? (code >= 500 && code < 600
      ? { label: 'Server error', detail: 'The site reported a server error. Try again later; this does not mean the bookmark is broken.' }
      : { label: 'Unexpected response', detail: 'The site returned an unexpected response to the automatic check. Open the page to see whether it works.' })
    return { ...reason, label: `${code} · ${reason.label}` }
  }
  if (/timeout|timed out/i.test(result.error ?? '')) {
    return { label: 'Timed out', detail: 'The site did not respond in time. Try again later or open the page; this does not mean the bookmark is broken.' }
  }
  if (result.status === 'dead') return reasons[404]!
  if (!result.error) return { label: 'Check failed', detail: 'The automatic check was inconclusive. Open the page to see whether it works; this does not mean the bookmark is broken.' }
  return { label: 'Network error', detail: 'The automatic check could not connect to the site. The cause is unknown; open the page to see whether it works.' }
}

function bookmarkRows(results: BookmarkResult[], state: SidebarState, view: AppView): string {
  return results.map(result => {
    const reason = resultReason(result)
    return `<div class="bookmark-row">
      <input aria-label="Select ${escape(result.bookmark.title)}" type="checkbox" data-bookmark="${escape(result.bookmark.id)}" data-focus="bookmark-${escape(result.bookmark.id)}" ${state.selected.has(result.bookmark.id) ? 'checked' : ''} ${view.busy ? 'disabled' : ''}>
      <div class="bookmark-info"><a href="${escape(result.bookmark.url)}" target="_blank" rel="noopener noreferrer" title="${escape(result.bookmark.url)}">${escape(result.bookmark.title)}</a>
      <div class="muted truncate">${escape(result.bookmark.url)}</div>
      <div class="muted">${escape(result.bookmark.folderPath ?? '')}</div>
      ${result.redirectUrl ? `<div class="muted">Redirects to ${escape(result.redirectUrl)}</div>` : ''}
      ${result.status !== 'moved' ? `<details class="reason"><summary data-focus="reason-${escape(result.bookmark.id)}" title="${escape(reason.detail)}">${escape(reason.label)}</summary><p>${escape(reason.detail)}</p></details>` : ''}</div></div>`
  }).join('')
}

export function updateAccordion(root: HTMLElement, state: SidebarState, view: AppView): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('.category-toggle')) {
    const status = button.dataset.status!
    const open = view.sections.has(status)
    if (button.getAttribute('aria-expanded') === String(open)) continue
    button.setAttribute('aria-expanded', String(open))
    const pane = root.querySelector<HTMLElement>(`#${button.getAttribute('aria-controls')}`)!
    animateAccordionPane(pane, open, view.motionEnabled,
      open ? bookmarkRows(state.results.filter(r => r.status === status), state, view) : undefined)
  }
}

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
  const previousScreen = root.dataset.screen
  const changedScreen = previousScreen !== view.screen
  const screenOrder = ['folders', 'results', 'complete']
  const direction = changedScreen && previousScreen
    ? screenOrder.indexOf(view.screen) > screenOrder.indexOf(previousScreen) ? 'forward' : 'back'
    : undefined
  const changedPhase = root.dataset.phase !== state.phase
  const previousDialog = root.dataset.dialog
  const dialog = view.about ? 'about' : view.confirm ? 'confirm' : ''
  // Progress is the only changing UI while scanning. Keep buttons mounted so
  // a response arriving between pointerdown and pointerup cannot swallow Cancel.
  if (!changedScreen && !changedPhase && view.screen === 'results' && state.phase === 'scanning' && previousDialog === dialog) {
    const count = root.querySelector('[data-scan-count]')
    if (count) count.textContent = `Checking ${state.progress.checked} / ${state.progress.total}`
    const progress = root.querySelector('progress')
    if (progress) { progress.max = state.progress.total || 1; progress.value = state.progress.checked }
    return
  }
  root.dataset.screen = view.screen
  root.dataset.phase = state.phase
  root.dataset.dialog = dialog
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
  function section(status: ReviewStatus, title: string, results: typeof dead): string {
    if (!results.length) return ''
    const expanded = view.sections.has(status)
    return `<section class="result-section status-${status}"><h2><button class="category-toggle" data-action="section" data-status="${status}" data-focus="section-${status}" aria-expanded="${expanded}" aria-controls="section-${status}">${statusIcon(status)}<span class="category-name">${title}</span><span class="category-count">${results.length}</span><svg class="section-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></h2>
      <div id="section-${status}" aria-hidden="${!expanded}" ${expanded ? '' : 'hidden inert'}>${expanded ? bookmarkRows(results, state, view) : ''}</div></section>`
  }
  const notice = `${state.error ? `<p role="alert" class="notice">${escape(state.error)}</p>` : ''}
    ${view.notice ? `<p role="status" class="notice">${escape(view.notice)}</p>${view.notice.includes('Create replacement folder') ? '<button data-action="replace" '+disabled+'>Create replacement folder</button>' : ''}` : ''}`
  const setup = view.screen === 'folders' ? `<section class="setup-screen" ${dialog ? 'inert' : ''}>
      <div class="controls"><button data-action="folders-all" ${disabled}>Select all</button><button data-action="folders-none" ${disabled}>Select none</button></div>
      <ul class="folder-tree" aria-label="Folders to scan">${folders(view.tree)}</ul>
      ${notice}
       <footer><button class="primary" data-action="scan" data-focus="scan" ${view.loading ? 'disabled' : ''}>${view.loading ? 'Loading folders…' : 'Scan bookmarks'}</button></footer></section>` : ''
  const review = view.screen === 'results' ? `<section class="review-screen" ${dialog ? 'inert' : ''}>
    <div role="status" aria-live="polite">${state.phase === 'scanning' ? `<p data-scan-count>Checking ${state.progress.checked} / ${state.progress.total}</p><progress max="${state.progress.total || 1}" value="${state.progress.checked}"></progress>` : ''}</div>
    ${state.phase === 'scanning' ? '<div class="scan-cancel"><button data-action="cancel" data-focus="cancel">Cancel</button></div>' : ''}
    ${notice}
    ${state.phase === 'done' ? `<div class="summary"><div class="status-counts"><span class="status-summary status-dead">${statusIcon('dead')}<strong>${dead.length}</strong> Likely dead</span><span class="status-summary status-unreachable">${statusIcon('unreachable')}<strong>${uncertain.length}</strong> Needs review</span><span class="status-summary status-moved">${statusIcon('moved')}<strong>${moved.length}</strong> Redirected</span></div>
      ${!state.results.length ? '<p>No HTTP(S) bookmarks in the selected folders.</p>' : ''}
      ${state.results.length && !dead.length && !uncertain.length && !moved.length ? '<p>No broken links found.</p>' : ''}</div>` : ''}
    <div id="results">${state.phase === 'done' ? `${reviewCount ? `<div class="controls"><button data-action="all" data-focus="all" ${disabled}>Select all</button><button data-action="none" data-focus="none" ${disabled}>Select none</button></div>` : ''}${section('dead', 'Likely dead', dead)}${section('unreachable', 'Needs review', uncertain)}${section('moved', 'Redirected', moved)}` : ''}</div>
    ${state.phase !== 'scanning' ? `<footer>${state.phase === 'done' && reviewCount ? `<label><input id="delete-mode" data-focus="delete-mode" type="checkbox" ${view.mode === 'delete' ? 'checked' : ''} ${disabled}> Delete permanently instead of moving</label>
      <button class="${view.mode === 'delete' ? 'danger' : 'primary'}" data-action="review" data-focus="review" ${!state.selected.size || view.busy ? 'disabled' : ''}>${view.busy ? 'Working…' : `Remove ${state.selected.size} bookmark${state.selected.size === 1 ? '' : 's'}`}</button>` : ''}
       <button class="${state.phase === 'done' && !reviewCount ? 'primary' : 'secondary'}" data-action="${state.phase === 'done' && !reviewCount ? 'finish' : 'folders'}" data-focus="cancel" ${view.busy ? 'disabled' : ''}>${state.phase === 'done' && !reviewCount ? 'Finish' : 'Cancel'}</button></footer>` : ''}</section>` : ''
  const completed = view.completion
  const removedCount = completed?.bookmarks.length ?? 0
  const hasIssues = !!completed && (completed.remaining > 0 || !!completed.warning)
  const complete = view.screen === 'complete' && completed ? `<section class="completion-screen" ${dialog ? 'inert' : ''}>
    <div class="completion-content">
      <div class="success-icon ${hasIssues ? 'partial' : ''}" aria-hidden="true">${hasIssues ? '<span>!</span>' : iconStarburst + bookmarkIcon}</div>
      <h1 tabindex="-1">${hasIssues ? removedCount ? 'A little more to do' : 'Nothing removed yet' : 'Nice work!'}</h1>
      <p class="completion-summary">${removedCount} bookmark${removedCount === 1 ? '' : 's'} ${completed.mode === 'move' ? 'moved to Deleted Bookmarks' : 'permanently deleted'}.</p>
      ${completed.remaining ? `<p class="notice">${completed.remaining} selected bookmark${completed.remaining === 1 ? ' still needs' : 's still need'} attention.</p>` : ''}
      ${completed.warning ? `<p role="alert" class="notice">${escape(completed.warning)}</p>` : ''}
      ${removedCount ? `<details class="removed-list"><summary>See removed bookmarks</summary><ul>${completed.bookmarks.map(b => `<li><strong>${escape(b.title)}</strong><span class="muted">${escape(b.url)}</span></li>`).join('')}</ul></details>` : ''}
      ${hasIssues ? '' : '<p class="completion-note">A little less clutter. A little more clarity.</p>'}
      <div class="share-links"><a href="https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener noreferrer">Share on Bluesky</a><a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener noreferrer">Share on X</a></div>
      <div class="support"><p>Made by <a href="https://nan.do" target="_blank" rel="noopener noreferrer">nando rossi (nan.do)</a></p><a class="coffee-link" href="https://buymeacoffee.com/nandorossi" target="_blank" rel="noopener noreferrer">${coffeeIcon} Buy me a coffee</a></div>
    </div>
    <footer>${hasIssues ? '<button data-action="review_remaining" data-focus="review-remaining">Review remaining</button>' : ''}<button class="primary" data-action="finish" data-focus="finish">Finish</button></footer>
    </section>` : ''
  root.innerHTML = `<header ${dialog ? 'inert' : ''}>
    <div class="brand-bar"><div class="brand">${headerIcon}<span>Cleanmarks</span></div><button class="about-button" data-action="about" data-focus="about" aria-label="About Cleanmarks${view.version ? ', version ' + escape(view.version) : ''}" title="About Cleanmarks" ${view.busy ? 'disabled' : ''}>${view.version ? `<span>v${escape(view.version)}</span>` : ''}<span class="info-symbol" aria-hidden="true">i</span></button></div>
    ${view.screen !== 'complete' ? `<div class="stage-header"><p class="step">Step ${view.screen === 'folders' ? '1' : '2'} of 2</p>
    <div class="title-row"><h1 tabindex="-1">${view.screen === 'folders' ? 'Choose folders' : state.phase === 'scanning' ? 'Checking bookmarks' : 'Review results'}</h1>
       ${view.screen === 'results' && state.phase !== 'scanning' ? `<button class="rescan-button" data-action="scan" data-focus="scan" aria-label="${state.phase === 'error' ? 'Retry scan' : 'Scan again'}" title="${state.phase === 'error' ? 'Retry scan' : 'Scan again'}" ${view.busy ? 'disabled' : ''}><span aria-hidden="true">↻</span></button>` : ''}</div>
    </div>` : ''}
    </header>
    ${view.screen === 'folders' ? setup : view.screen === 'results' ? review : complete}
    ${view.confirm ? `<dialog open aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">${view.mode === 'move' ? 'Move to Deleted Bookmarks?' : 'Permanently delete bookmarks?'}</h2><p>${state.selected.size} selected. ${view.mode === 'move' ? 'You can move these back using your browser’s bookmark manager.' : 'This cannot be undone.'}</p>
      <div class="controls"><button data-action="dismiss">Cancel</button><button class="${view.mode === 'delete' ? 'danger' : 'primary'}" data-action="confirm">${view.mode === 'move' ? 'Confirm move' : 'Delete permanently'}</button></div></dialog>` : ''}
    ${view.about ? `<dialog class="about-dialog" open aria-modal="true" aria-labelledby="about-title">
      <button class="about-close" data-action="close_about" data-focus="close-about" aria-label="Close about"><span aria-hidden="true">×</span></button>
      <div class="about-main">
        <div class="about-identity"><div class="about-app-icon">${bookmarkIcon}</div><div><h2 id="about-title">Cleanmarks</h2>${view.version ? `<p class="about-version">Version ${escape(view.version)}</p>` : ''}</div></div>
        <a class="about-site" href="https://apps.nan.do/cleanmarks" target="_blank" rel="noopener noreferrer">apps.nan.do/cleanmarks <span aria-hidden="true">↗</span></a>
        <a class="coffee-link about-coffee" href="https://buymeacoffee.com/nandorossi" target="_blank" rel="noopener noreferrer">${coffeeIcon} Buy me a coffee</a>
      </div>
      <p class="about-footer">©${copyYears} made with ❤️ by <a href="https://nan.do" target="_blank" rel="noopener noreferrer">nando rossi</a> · <a class="credit" href="https://github.com/steipete/CodexBar" target="_blank" rel="noopener noreferrer">CodexBar</a> <a class="credit-license" href="../../licenses/CodexBar-MIT.txt" target="_blank" rel="noopener noreferrer">MIT</a> · <a class="credit" href="https://github.com/mozilla/webextension-polyfill" target="_blank" rel="noopener noreferrer">webextension-polyfill</a> <a class="credit-license" href="../../licenses/webextension-polyfill-MPL-2.0.txt" target="_blank" rel="noopener noreferrer">MPL-2.0</a></p></dialog>` : ''}`
  updateFolderSelection(root, view)
  const resultsElement = root.querySelector('#results')
  if (resultsElement) resultsElement.scrollTop = scroll
  const folderTree = root.querySelector('.folder-tree')
  if (folderTree) folderTree.scrollTop = view.folderScroll
  if (document.scrollingElement) document.scrollingElement.scrollTop = changedScreen ? 0 : pageScroll
  if (dialog) root.querySelector<HTMLButtonElement>('dialog button')?.focus()
  else if (previousDialog === 'about') root.querySelector<HTMLButtonElement>('[data-action="about"]')?.focus({ preventScroll: true })
  else if (hadDialog) root.querySelector<HTMLButtonElement>('[data-action="review"]')?.focus()
  else if (changedScreen) root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
  else if (focused) [...root.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === focused)?.focus({ preventScroll: true })
  animateView(root, {
    screen: changedScreen,
    phase: changedPhase && view.screen === 'results',
    dialog: !!dialog && !hadDialog,
    celebrate: changedScreen && view.screen === 'complete' && removedCount > 0 && !hasIssues,
    direction,
  }, view.motionEnabled)
}
