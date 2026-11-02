import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '../../src/background/rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('reserves distinct slots for concurrent same-domain callers', async () => {
    const limiter = new RateLimiter(1000)
    let count = 0
    const waits = Array.from({ length: 3 }, () => limiter.wait('a.com').then(() => count++))
    await vi.advanceTimersByTimeAsync(0)
    expect(count).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(count).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(count).toBe(3)
    await Promise.all(waits)
  })

  it('cancels a queued wait immediately', async () => {
    const limiter = new RateLimiter(1000)
    await limiter.wait('a.com')
    const controller = new AbortController()
    const wait = limiter.wait('a.com', controller.signal)
    controller.abort()
    await wait
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows first request to a domain immediately', async () => {
    const limiter = new RateLimiter(1000)
    const start = Date.now()
    await limiter.wait('example.com')
    expect(Date.now() - start).toBeLessThan(10)
  })

  it('delays second request to same domain by perDomainDelayMs', async () => {
    const limiter = new RateLimiter(1000)
    await limiter.wait('example.com')

    let resolved = false
    const p = limiter.wait('example.com').then(() => { resolved = true })

    // Not resolved immediately
    await vi.advanceTimersByTimeAsync(500)
    expect(resolved).toBe(false)

    // Resolved after delay
    await vi.advanceTimersByTimeAsync(600)
    expect(resolved).toBe(true)

    await p
  })

  it('does not delay requests to different domains', async () => {
    const limiter = new RateLimiter(1000)
    await limiter.wait('example.com')

    const start = Date.now()
    await limiter.wait('other.com')
    expect(Date.now() - start).toBeLessThan(10)
  })
})
