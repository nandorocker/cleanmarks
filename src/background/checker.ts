import type { BookmarkStatus } from '../types'

export interface CheckResult {
  status: BookmarkStatus
  statusCode?: number
  redirectUrl?: string
  error?: string
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ])
}

async function fetchWithMethod(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<Response> {
  return withTimeout(
    fetch(url, {
      method,
      redirect: 'follow',
      credentials: 'omit',
    }),
    timeoutMs
  )
}

export async function checkUrl(url: string, timeoutMs: number): Promise<CheckResult> {
  let response: Response
  try {
    response = await fetchWithMethod(url, 'HEAD', timeoutMs)
    if (response.status === 405) {
      response = await fetchWithMethod(url, 'GET', timeoutMs)
    }
  } catch (err) {
    return {
      status: 'unreachable',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const { status, url: finalUrl } = response

  if (status === 404 || status === 410) {
    return { status: 'dead', statusCode: status }
  }

  if (status >= 200 && status < 300) {
    const origDomain = extractDomain(url)
    const finalDomain = extractDomain(finalUrl)
    if (finalDomain !== origDomain) {
      return { status: 'moved', statusCode: status, redirectUrl: finalUrl }
    }
    return { status: 'alive', statusCode: status }
  }

  if (status >= 500) {
    return { status: 'unreachable', statusCode: status }
  }

  if (status >= 400) {
    return { status: 'dead', statusCode: status }
  }

  return { status: 'alive', statusCode: status }
}
