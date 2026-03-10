// tests/background/cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCache, saveCache, clearCache } from '../../src/background/cache'
import type { BookmarkResult } from '../../src/types'

// Mock webextension-polyfill storage
const store: Record<string, unknown> = {}
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj) }),
        remove: vi.fn(async (key: string) => { delete store[key] }),
      },
    },
  },
}))

const makeResult = (): BookmarkResult => ({
  bookmark: { id: '1', title: 'Test', url: 'https://example.com' },
  status: 'dead',
  statusCode: 404,
})

describe('cache', () => {
  beforeEach(() => { Object.keys(store).forEach(k => delete store[k]) })

  it('returns null when cache is empty', async () => {
    expect(await loadCache(7)).toBeNull()
  })

  it('returns results after saving', async () => {
    const results = [makeResult()]
    await saveCache(results)
    const loaded = await loadCache(7)
    expect(loaded).toHaveLength(1)
    expect(loaded?.[0]?.status).toBe('dead')
  })

  it('returns null when cache is expired', async () => {
    const results = [makeResult()]
    await saveCache(results)
    // Manually backdating the timestamp
    const key = 'scan_cache'
    const entry = store[key] as { results: BookmarkResult[]; timestamp: number }
    store[key] = { ...entry, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 }
    expect(await loadCache(7)).toBeNull()
  })

  it('returns null after clearCache', async () => {
    await saveCache([makeResult()])
    await clearCache()
    expect(await loadCache(7)).toBeNull()
  })
})
