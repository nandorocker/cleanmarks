// src/types.ts

export type BookmarkStatus = 'dead' | 'moved' | 'unreachable' | 'alive'

export interface FlatBookmark {
  id: string
  title: string
  url: string
}

export interface BookmarkResult {
  bookmark: FlatBookmark
  status: BookmarkStatus
  statusCode?: number        // e.g. 404
  redirectUrl?: string       // final URL after redirects (for 'moved')
  error?: string             // DNS fail message, timeout message, etc.
}

export type ScanPhase = 'idle' | 'scanning' | 'done' | 'error'

export interface ScanProgress {
  total: number
  checked: number
}

// Messages sent from background → sidebar over the port
export type BackgroundMessage =
  | { type: 'scan_progress'; progress: ScanProgress }
  | { type: 'result'; result: BookmarkResult }
  | { type: 'scan_done' }
  | { type: 'scan_error'; error: string }

// Messages sent from sidebar → background over the port
export type SidebarMessage =
  | { type: 'start_scan' }
  | { type: 'cancel_scan' }

export interface Settings {
  concurrency: number           // default: 5
  perDomainDelayMs: number      // default: 1000
  timeoutMs: number             // default: 10000
  cacheTtlDays: number          // default: 7
}

export const DEFAULT_SETTINGS: Settings = {
  concurrency: 5,
  perDomainDelayMs: 1000,
  timeoutMs: 10000,
  cacheTtlDays: 7,
}
