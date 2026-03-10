import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '../../src/background/rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

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
