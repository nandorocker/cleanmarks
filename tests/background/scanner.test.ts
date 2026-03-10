import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Scanner } from '../../src/background/scanner'
import type { FlatBookmark, BookmarkResult } from '../../src/types'

// Mock dependencies
vi.mock('../../src/background/checker', () => ({
  checkUrl: vi.fn(),
}))
vi.mock('../../src/background/rate-limiter', () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({ wait: vi.fn().mockResolvedValue(undefined) })),
}))

import { checkUrl } from '../../src/background/checker'
const mockCheckUrl = vi.mocked(checkUrl)

const makeBookmark = (id: string, url: string): FlatBookmark => ({
  id, title: `Bookmark ${id}`, url,
})

describe('Scanner', () => {
  beforeEach(() => { mockCheckUrl.mockReset() })

  it('emits result events for each bookmark', async () => {
    mockCheckUrl.mockResolvedValue({ status: 'alive', statusCode: 200 })
    const bookmarks = [makeBookmark('1', 'https://a.com'), makeBookmark('2', 'https://b.com')]
    const scanner = new Scanner({ concurrency: 2, perDomainDelayMs: 0, timeoutMs: 5000, cacheTtlDays: 7 })

    const results: BookmarkResult[] = []
    scanner.on('result', r => results.push(r))
    await scanner.run(bookmarks)

    expect(results).toHaveLength(2)
  })

  it('emits done event when scan completes', async () => {
    mockCheckUrl.mockResolvedValue({ status: 'dead', statusCode: 404 })
    const scanner = new Scanner({ concurrency: 1, perDomainDelayMs: 0, timeoutMs: 5000, cacheTtlDays: 7 })

    let done = false
    scanner.on('done', () => { done = true })
    await scanner.run([makeBookmark('1', 'https://x.com')])

    expect(done).toBe(true)
  })

  it('can be cancelled mid-scan', async () => {
    let resolveCheck: (() => void) | null = null
    mockCheckUrl.mockImplementation(() => new Promise<{ status: 'alive'; statusCode: 200 }>(res => {
      resolveCheck = () => res({ status: 'alive', statusCode: 200 })
    }))

    const bookmarks = [makeBookmark('1', 'https://a.com'), makeBookmark('2', 'https://b.com')]
    const scanner = new Scanner({ concurrency: 1, perDomainDelayMs: 0, timeoutMs: 5000, cacheTtlDays: 7 })

    const results: BookmarkResult[] = []
    scanner.on('result', r => results.push(r))

    const runPromise = scanner.run(bookmarks)
    scanner.cancel()
    if (resolveCheck) resolveCheck()
    await runPromise

    // At most 1 result (the in-flight one)
    expect(results.length).toBeLessThanOrEqual(1)
  })
})
