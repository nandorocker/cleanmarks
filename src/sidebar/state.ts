// src/sidebar/state.ts
import type { BackgroundMessage, BookmarkResult, ScanPhase, ScanProgress, BookmarkStatus } from '../types'

export interface SidebarState {
  phase: ScanPhase
  progress: ScanProgress
  results: BookmarkResult[]
  selected: Set<string>   // bookmark ids
  error: string | null
  showConfirm: boolean
  lastScanDate: string | null
}

export function createState(): SidebarState {
  return {
    phase: 'idle',
    progress: { total: 0, checked: 0 },
    results: [],
    selected: new Set(),
    error: null,
    showConfirm: false,
    lastScanDate: null,
  }
}

export function applyMessage(state: SidebarState, msg: BackgroundMessage): SidebarState {
  switch (msg.type) {
    case 'scan_progress':
      return { ...state, phase: 'scanning', progress: msg.progress }

    case 'result': {
      const results = [...state.results, msg.result]
      const selected = new Set(state.selected)
      if (msg.result.status === 'dead') selected.add(msg.result.bookmark.id)
      return { ...state, results, selected }
    }

    case 'scan_done':
      return { ...state, phase: 'done' }

    case 'scan_error':
      return { ...state, phase: 'error', error: msg.error }

    default:
      return state
  }
}

export function toggleSelection(state: SidebarState, id: string): SidebarState {
  const selected = new Set(state.selected)
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  return { ...state, selected }
}

export function selectAll(state: SidebarState, status: BookmarkStatus): SidebarState {
  const selected = new Set(state.selected)
  for (const r of state.results) {
    if (r.status === status) selected.add(r.bookmark.id)
  }
  return { ...state, selected }
}

export function selectNone(state: SidebarState, status: BookmarkStatus): SidebarState {
  const selected = new Set(state.selected)
  for (const r of state.results) {
    if (r.status === status) selected.delete(r.bookmark.id)
  }
  return { ...state, selected }
}

export function selectedCount(state: SidebarState): number {
  return state.selected.size
}

export function resultsByStatus(state: SidebarState, status: BookmarkStatus): BookmarkResult[] {
  return state.results.filter(r => r.status === status)
}

export function selectRange(state: SidebarState, ids: string[], checked: boolean): SidebarState {
  const selected = new Set(state.selected)
  const eligible = new Set(state.results.filter(r => r.status !== 'alive').map(r => r.bookmark.id))
  for (const id of ids) {
    if (!eligible.has(id)) continue
    if (checked) selected.add(id)
    else selected.delete(id)
  }
  return { ...state, selected }
}
