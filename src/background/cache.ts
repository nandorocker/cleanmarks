// src/background/cache.ts
import browser from 'webextension-polyfill'
import type { BookmarkResult } from '../types'

interface CacheEntry {
  results: BookmarkResult[]
  timestamp: number
}

const CACHE_KEY = 'scan_cache'

export async function loadCache(ttlDays: number): Promise<BookmarkResult[] | null> {
  const stored = await browser.storage.local.get(CACHE_KEY)
  const entry = stored[CACHE_KEY] as CacheEntry | undefined
  if (!entry) return null

  const ageMs = Date.now() - entry.timestamp
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000
  if (ageMs > ttlMs) return null

  return entry.results
}

export async function saveCache(results: BookmarkResult[]): Promise<void> {
  await browser.storage.local.set({
    [CACHE_KEY]: { results, timestamp: Date.now() } satisfies CacheEntry,
  })
}

export async function clearCache(): Promise<void> {
  await browser.storage.local.remove(CACHE_KEY)
}
