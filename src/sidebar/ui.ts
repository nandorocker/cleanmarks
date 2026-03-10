// src/sidebar/ui.ts
import type { SidebarState } from './state'
import type { BookmarkStatus } from '../types'
import { resultsByStatus, selectedCount } from './state'

export interface SidebarActions {
  onScan: () => void
  onCancel: () => void
  onToggle: (id: string) => void
  onSelectAll: (status: BookmarkStatus) => void
  onSelectNone: (status: BookmarkStatus) => void
  onZap: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

const SECTION_ORDER: BookmarkStatus[] = ['dead', 'moved', 'unreachable']
const SECTION_LABEL: Record<BookmarkStatus, string> = {
  dead: 'Dead',
  moved: 'Moved',
  unreachable: 'Unreachable',
  alive: 'Alive',
}
const STATUS_CODE_LABEL: Partial<Record<number, string>> = {
  404: '404', 410: '410', 0: 'DNS',
}

let expandedSections = new Set<BookmarkStatus>(['dead'])

export function render(state: SidebarState, actions: SidebarActions): void {
  const content = document.getElementById('content')!
  const zapBar = document.getElementById('zap-bar')!
  const modalContainer = document.getElementById('modal-container')!

  if (state.phase === 'idle') {
    content.innerHTML = `
      <div class="idle-view">
        <button class="btn-primary" data-action="scan">🔍 Scan Bookmarks</button>
        <p>${state.lastScanDate ? `Last scan: ${state.lastScanDate}` : 'No scan yet'}</p>
      </div>`
    zapBar.innerHTML = ''
  }

  else if (state.phase === 'scanning') {
    const pct = state.progress.total > 0
      ? Math.round(state.progress.checked / state.progress.total * 100)
      : 0
    content.innerHTML = `
      <div class="scanning-view">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>Checking URLs…</span>
          <span style="color:#888">${state.progress.checked} / ${state.progress.total}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-counters">
          <span style="color:#e05c5c">● ${resultsByStatus(state, 'dead').length} dead</span>
          <span style="color:#e0a95c">● ${resultsByStatus(state, 'moved').length} moved</span>
          <span style="color:#888">● ${resultsByStatus(state, 'unreachable').length} unreachable</span>
        </div>
        <button class="btn-ghost" data-action="cancel" style="margin-top:12px">Cancel</button>
      </div>`
    zapBar.innerHTML = ''
  }

  else if (state.phase === 'done') {
    const sections = SECTION_ORDER
      .filter(s => resultsByStatus(state, s).length > 0)
      .map(status => renderSection(state, status))
      .join('')
    content.innerHTML = sections || '<div class="idle-view"><p>All bookmarks are healthy! 🎉</p></div>'

    const count = selectedCount(state)
    zapBar.innerHTML = count > 0 ? `
      <div class="zap-bar">
        <button class="btn-zap" data-action="zap">⚡ Zap ${count} bookmark${count !== 1 ? 's' : ''}</button>
        <div class="zap-count">${count} selected across all categories</div>
      </div>` : ''
  }

  else if (state.phase === 'error') {
    content.innerHTML = `
      <div class="error-view">
        <p>⚠️ ${state.error ?? 'Something went wrong'}</p>
        <button class="btn-primary" data-action="scan">Retry</button>
      </div>`
    zapBar.innerHTML = ''
  }

  // Confirmation modal
  if (state.showConfirm) {
    const count = selectedCount(state)
    const dead = state.results.filter(r => r.status === 'dead' && state.selected.has(r.bookmark.id)).length
    const moved = state.results.filter(r => r.status === 'moved' && state.selected.has(r.bookmark.id)).length
    const unreachable = state.results.filter(r => r.status === 'unreachable' && state.selected.has(r.bookmark.id)).length
    const breakdown = [
      dead > 0 ? `${dead} dead` : '',
      moved > 0 ? `${moved} moved` : '',
      unreachable > 0 ? `${unreachable} unreachable` : '',
    ].filter(Boolean).join(', ')

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h2>Delete ${count} bookmark${count !== 1 ? 's' : ''}?</h2>
          <p>${breakdown}<br>This cannot be undone.</p>
          <div class="modal-buttons">
            <button class="btn-cancel" data-action="cancel-delete">Cancel</button>
            <button class="btn-confirm-delete" data-action="confirm-delete">Delete</button>
          </div>
        </div>
      </div>`
  } else {
    modalContainer.innerHTML = ''
  }
}

function renderSection(state: SidebarState, status: BookmarkStatus): string {
  const results = resultsByStatus(state, status)
  const isExpanded = expandedSections.has(status)
  const label = SECTION_LABEL[status]
  const rows = isExpanded ? results.map(r => {
    const checked = state.selected.has(r.bookmark.id) ? 'checked' : ''
    const badge = r.statusCode != null
      ? (STATUS_CODE_LABEL[r.statusCode] ?? String(r.statusCode))
      : (r.error ? 'ERR' : '')
    return `<label class="bookmark-row" data-id="${r.bookmark.id}">
      <input type="checkbox" ${checked} data-id="${r.bookmark.id}">
      <div class="bookmark-info">
        <div class="bookmark-name">${escapeHtml(r.bookmark.title)}</div>
        <div class="bookmark-url">${escapeHtml(r.bookmark.url)}</div>
      </div>
      <span class="status-badge">${badge}</span>
    </label>`
  }).join('') : ''

  return `<div class="section" data-status="${status}">
    <div class="section-header" data-toggle="${status}">
      <span class="section-title ${status}">● ${label} — ${results.length}</span>
      <div class="section-controls">
        <span data-select-all="${status}">all</span>
        <span data-select-none="${status}">none</span>
        <span class="chevron">${isExpanded ? '▾' : '▸'}</span>
      </div>
    </div>
    ${isExpanded ? `<div class="section-list">${rows}</div>` : ''}
  </div>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Attach delegated event listeners — called ONCE on page load.
export function attachDelegatedListeners(actions: SidebarActions): void {
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // data-action buttons
    const actionEl = target.closest('[data-action]') as HTMLElement | null
    if (actionEl) {
      e.stopPropagation()
      switch (actionEl.dataset['action']) {
        case 'scan': actions.onScan(); return
        case 'cancel': actions.onCancel(); return
        case 'zap': actions.onZap(); return
        case 'confirm-delete': actions.onConfirmDelete(); return
        case 'cancel-delete': actions.onCancelDelete(); return
      }
    }

    // Select all / none in a category
    const selectAllEl = target.closest('[data-select-all]') as HTMLElement | null
    if (selectAllEl) {
      e.stopPropagation()
      actions.onSelectAll(selectAllEl.dataset['selectAll'] as BookmarkStatus)
      return
    }
    const selectNoneEl = target.closest('[data-select-none]') as HTMLElement | null
    if (selectNoneEl) {
      e.stopPropagation()
      actions.onSelectNone(selectNoneEl.dataset['selectNone'] as BookmarkStatus)
      return
    }

    // Toggle section expand/collapse
    const toggle = target.closest('[data-toggle]') as HTMLElement | null
    if (toggle) {
      const status = toggle.dataset['toggle'] as BookmarkStatus
      if (expandedSections.has(status)) expandedSections.delete(status)
      else expandedSections.add(status)
      return
    }

    // Checkbox / bookmark row toggle
    const row = target.closest('[data-id]') as HTMLElement | null
    if (row?.dataset['id']) {
      actions.onToggle(row.dataset['id']!)
    }
  })
}
