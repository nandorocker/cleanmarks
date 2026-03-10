// src/sidebar/index.ts
import browser from 'webextension-polyfill'
import {
  createState, applyMessage, toggleSelection,
  selectAll, selectNone,
} from './state'
import { render, attachDelegatedListeners } from './ui'
import type { SidebarActions } from './ui'
import type { BackgroundMessage, SidebarMessage, BookmarkStatus } from '../types'

let state = createState()
const port = browser.runtime.connect({ name: 'sidebar' })

function sendToBackground(msg: SidebarMessage): void {
  port.postMessage(msg)
}

const actions: SidebarActions = {
  onScan: () => {
    const prev = state
    state = { ...createState(), lastScanDate: prev.lastScanDate }
    state = { ...state, phase: 'scanning' }
    renderView()
    sendToBackground({ type: 'start_scan' })
  },
  onCancel: () => {
    sendToBackground({ type: 'cancel_scan' })
    state = { ...createState(), lastScanDate: state.lastScanDate }
    renderView()
  },
  onToggle: (id: string) => { state = toggleSelection(state, id); renderView() },
  onSelectAll: (status: BookmarkStatus) => { state = selectAll(state, status); renderView() },
  onSelectNone: (status: BookmarkStatus) => { state = selectNone(state, status); renderView() },
  onZap: () => { state = { ...state, showConfirm: true }; renderView() },
  onConfirmDelete: async () => {
    state = { ...state, showConfirm: false }
    renderView()
    const ids = [...state.selected]
    for (const id of ids) {
      try { await browser.bookmarks.remove(id) } catch { /* already deleted */ }
    }
    state = {
      ...state,
      results: state.results.filter(r => !ids.includes(r.bookmark.id)),
      selected: new Set(),
      lastScanDate: new Date().toLocaleDateString(),
    }
    renderView()
  },
  onCancelDelete: () => { state = { ...state, showConfirm: false }; renderView() },
}

function renderView(): void {
  render(state, actions)
}

port.onMessage.addListener((rawMsg: unknown) => {
  state = applyMessage(state, rawMsg as BackgroundMessage)
  renderView()
})

attachDelegatedListeners(actions)

renderView()
sendToBackground({ type: 'start_scan' })
