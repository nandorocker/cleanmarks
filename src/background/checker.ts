import type { BookmarkStatus } from '../types'

export interface CheckResult {
  status: BookmarkStatus
  statusCode?: number
  redirectUrl?: string
  error?: string
}

export async function checkUrl(url: string, timeoutMs: number, signal?: AbortSignal): Promise<CheckResult> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const request = (method: string) => fetch(url, {
      method, redirect: 'follow', credentials: 'omit', signal: controller.signal,
    })
    let response = await request('HEAD')
    if (response.status === 405 || response.status === 501) response = await request('GET')
    // Never download the fallback response body unnecessarily.
    await response.body?.cancel()
    const status = response.status
    if (status === 404 || status === 410) return { status: 'dead', statusCode: status }
    if (status >= 200 && status < 300) {
      if (new URL(response.url).hostname !== new URL(url).hostname) {
        return { status: 'moved', statusCode: status, redirectUrl: response.url }
      }
      return { status: 'alive', statusCode: status }
    }
    return { status: 'unreachable', statusCode: status, error: 'Could not verify this page' }
  } catch (err) {
    return { status: 'unreachable', error: timedOut ? `timeout after ${timeoutMs}ms` : String(err) }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
