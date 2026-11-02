import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkUrl } from '../../src/background/checker'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(status: number, url: string = 'https://example.com') {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    url,  // fetch sets this to the final URL after redirects
  } as Response)
}

describe('checkUrl', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it.each([401, 403, 429, 500, 503])('does not mark HTTP %s dead', async status => {
    mockFetch.mockReturnValue(makeResponse(status))
    expect((await checkUrl('https://example.com', 100)).status).toBe('unreachable')
  })

  it('passes cancellation to fetch', async () => {
    const controller = new AbortController()
    mockFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const promise = checkUrl('https://example.com', 1000, controller.signal)
    controller.abort()
    expect((await promise).status).toBe('unreachable')
    expect(mockFetch.mock.calls[0]![1].signal.aborted).toBe(true)
  })

  it('returns alive for 200', async () => {
    mockFetch.mockReturnValue(makeResponse(200))
    const result = await checkUrl('https://example.com', 10000)
    expect(result.status).toBe('alive')
    expect(result.statusCode).toBe(200)
  })

  it('returns dead for 404', async () => {
    mockFetch.mockReturnValue(makeResponse(404))
    const result = await checkUrl('https://example.com', 10000)
    expect(result.status).toBe('dead')
    expect(result.statusCode).toBe(404)
  })

  it('returns dead for 410', async () => {
    mockFetch.mockReturnValue(makeResponse(410))
    const result = await checkUrl('https://gone.com', 10000)
    expect(result.status).toBe('dead')
  })

  it('returns moved when final URL domain differs', async () => {
    mockFetch.mockReturnValue(makeResponse(200, 'https://newsite.com/page'))
    const result = await checkUrl('https://oldsite.com', 10000)
    expect(result.status).toBe('moved')
    expect(result.redirectUrl).toBe('https://newsite.com/page')
  })

  it('returns alive (not moved) for http→https same domain redirect', async () => {
    mockFetch.mockReturnValue(makeResponse(200, 'https://example.com/page'))
    const result = await checkUrl('http://example.com/page', 10000)
    expect(result.status).toBe('alive')
  })

  it('retries with GET when HEAD returns 405', async () => {
    mockFetch
      .mockReturnValueOnce(makeResponse(405))   // HEAD fails
      .mockReturnValueOnce(makeResponse(200))   // GET succeeds
    const result = await checkUrl('https://example.com', 10000)
    expect(result.status).toBe('alive')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1]?.[1]?.method).toBe('GET')
  })

  it('returns unreachable on network error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await checkUrl('https://down.com', 10000)
    expect(result.status).toBe('unreachable')
    expect(result.error).toContain('Failed to fetch')
  })

  it('returns unreachable on timeout', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const p = checkUrl('https://slow.com', 100)
    await vi.advanceTimersByTimeAsync(200)
    const result = await p
    expect(result.status).toBe('unreachable')
    expect(result.error).toContain('timeout')
    vi.useRealTimers()
  })
})
