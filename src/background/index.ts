// src/background/index.ts
import browser from 'webextension-polyfill'
import { getAllBookmarks } from './bookmarks'
import { Scanner } from './scanner'
import { loadCache, saveCache, clearCache } from './cache'
import { loadSettings } from '../settings'
import { openSidebar } from '../platform'
import type { BackgroundMessage, SidebarMessage } from '../types'

// Invalidate cache when bookmarks change
browser.bookmarks.onCreated.addListener(() => clearCache())
browser.bookmarks.onRemoved.addListener(() => clearCache())

let activeScanner: Scanner | null = null

// Open sidebar on toolbar click (Chrome)
browser.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openSidebar(tab.id)
})

// Long-lived port connection from sidebar
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidebar') return

  function send(msg: BackgroundMessage): void {
    try { port.postMessage(msg) } catch { /* port closed */ }
  }

  port.onMessage.addListener(async (rawMsg: unknown) => {
    const msg = rawMsg as SidebarMessage

    if (msg.type === 'start_scan') {
      // Cancel any existing scan
      activeScanner?.cancel()

      const settings = await loadSettings()
      const cached = await loadCache(settings.cacheTtlDays)
      if (cached) {
        for (const result of cached) send({ type: 'result', result })
        send({ type: 'scan_done' })
        return
      }

      let bookmarks
      try {
        bookmarks = await getAllBookmarks()
      } catch (err) {
        send({ type: 'scan_error', error: String(err) })
        return
      }

      const total = bookmarks.length
      const scanner = new Scanner(settings)
      activeScanner = scanner

      const collectedResults: import('../types').BookmarkResult[] = []

      scanner.on('result', result => {
        collectedResults.push(result)
        send({ type: 'result', result })
      })
      scanner.on('progress', (checked) => send({ type: 'scan_progress', progress: { checked, total } }))
      scanner.on('done', async () => {
        await saveCache(collectedResults)
        send({ type: 'scan_done' })
        activeScanner = null
      })
      scanner.on('error', err => send({ type: 'scan_error', error: err }))

      try {
        await scanner.run(bookmarks)
      } catch (err) {
        send({ type: 'scan_error', error: String(err) })
      }
    }

    if (msg.type === 'cancel_scan') {
      activeScanner?.cancel()
      activeScanner = null
    }
  })

  port.onDisconnect.addListener(() => {
    // Don't cancel scan — let it continue in background
  })
})
