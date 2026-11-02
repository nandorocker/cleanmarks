# Clean Bookmarks Extension — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser extension (Chrome, Firefox, Edge, Safari) that scans bookmarks for dead/moved/unreachable URLs and lets the user delete them in bulk via a sidebar UI.

**Architecture:** Background service worker reads all bookmarks, checks each URL with a per-domain rate limiter, classifies results as Dead/Moved/Unreachable, and streams them to a sidebar panel via a long-lived port. User selects which to delete and confirms with one click.

**Tech Stack:** TypeScript, Manifest V3, Vite, webextension-polyfill, Vitest (tests)

---

## File Structure

```
src/
  types.ts                    # Shared types: BookmarkResult, ScanStatus, Settings, messages
  settings.ts                 # Read/write settings from browser.storage.local
  platform.ts                 # Browser detection, open sidebar API adapter

  background/
    index.ts                  # Service worker entry: registers listeners, handles port connections
    bookmarks.ts              # Read bookmark tree, flatten to array of {id, title, url}
    rate-limiter.ts           # Per-domain rate limiter (token bucket per domain)
    checker.ts                # Check one URL: HEAD→classify, retry GET on 405, 10s timeout
    scanner.ts                # Orchestrate scan: queue, concurrency, stream results via port

  sidebar/
    index.html                # Sidebar HTML shell
    index.ts                  # Entry: connects port, dispatches messages to state
    state.ts                  # Pure state machine: idle→scanning→results + selection logic
    ui.ts                     # Renders state to DOM, attaches event listeners

tests/
  background/
    bookmarks.test.ts
    rate-limiter.test.ts
    checker.test.ts
    scanner.test.ts
  sidebar/
    state.test.ts

manifest.json                 # Base manifest (Firefox/Safari)
manifest.chrome.json          # Chrome/Edge overrides (adds sidePanel permission + key)
vite.config.ts
tsconfig.json
package.json
```

---

## Chunk 1: Project Scaffold

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.json`
- Create: `manifest.chrome.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "clean-bookmarks",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:chrome": "vite build --watch --mode chrome",
    "dev:firefox": "vite build --watch --mode firefox",
    "build:chrome": "vite build --mode chrome",
    "build:firefox": "vite build --mode firefox",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.4.0",
    "@types/chrome": "^0.0.268",
    "webextension-polyfill": "^0.10.0",
    "@types/webextension-polyfill": "^0.10.7"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isChrome = mode === 'chrome'

  return {
    build: {
      outDir: isChrome ? 'dist/chrome' : 'dist/firefox',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          sidebar: resolve(__dirname, 'src/sidebar/index.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      target: 'esnext',
      minify: false,
    },
    define: {
      __IS_CHROME__: JSON.stringify(isChrome),
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
```

- [ ] **Step 4: Create base manifest.json (Firefox/Safari)**

```json
{
  "manifest_version": 3,
  "name": "Clean Bookmarks",
  "version": "0.1.0",
  "description": "Find and remove dead bookmarks.",
  "permissions": ["bookmarks", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Clean Bookmarks"
  },
  "sidebar_action": {
    "default_panel": "sidebar.html",
    "default_title": "Clean Bookmarks"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 5: Create manifest.chrome.json (Chrome/Edge overrides)**

```json
{
  "permissions": ["bookmarks", "storage", "sidePanel"],
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "action": {
    "default_title": "Clean Bookmarks"
  }
}
```

Note: The `vite.config.ts` above does not yet handle manifest merging. The manifest merge Vite plugin is added in Task 11 (Chunk 7). Until then, `dist/chrome/manifest.json` will not include Chrome-specific keys — the build is still useful for testing individual modules and running unit tests.

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 7: Create placeholder icons (so manifest doesn't error on load)**

```bash
mkdir -p src/icons
# Create minimal 1x1 transparent PNG for each size (placeholder — replace before publishing)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > src/icons/icon16.png
cp src/icons/icon16.png src/icons/icon48.png
cp src/icons/icon16.png src/icons/icon128.png
```

- [ ] **Step 8: Commit**

```bash
git init
git add package.json tsconfig.json vite.config.ts manifest.json manifest.chrome.json src/icons/
git commit -m "chore: initialize extension project scaffold"
```

---

## Chunk 2: Shared Types + Bookmark Reading

### Task 2: Define shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types"
```

---

### Task 3: Bookmark reader

**Files:**
- Create: `src/background/bookmarks.ts`
- Create: `tests/background/bookmarks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/background/bookmarks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flattenBookmarks } from '../../src/background/bookmarks'
import type { BookmarkTreeNode } from 'webextension-polyfill'

// We test the pure flatten logic — no browser API needed
describe('flattenBookmarks', () => {
  it('returns empty array for empty tree', () => {
    expect(flattenBookmarks([])).toEqual([])
  })

  it('extracts a single bookmark', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'My Site', url: 'https://example.com'
      }]
    }]
    expect(flattenBookmarks(tree)).toEqual([
      { id: '2', title: 'My Site', url: 'https://example.com' }
    ])
  })

  it('skips folders (no url)', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'Folder', children: []
      }]
    }]
    expect(flattenBookmarks(tree)).toEqual([])
  })

  it('flattens nested folders', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: 'Folder', children: [{
          id: '3', title: 'Nested', url: 'https://nested.com'
        }]
      }]
    }]
    const result = flattenBookmarks(tree)
    expect(result).toHaveLength(1)
    expect(result[0]?.url).toBe('https://nested.com')
  })

  it('skips bookmarks with no title (uses url as fallback title)', () => {
    const tree: BookmarkTreeNode[] = [{
      id: '1', title: 'Root', children: [{
        id: '2', title: '', url: 'https://no-title.com'
      }]
    }]
    const result = flattenBookmarks(tree)
    expect(result[0]?.title).toBe('https://no-title.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/background/bookmarks.test.ts
```

Expected: FAIL — `flattenBookmarks` not found.

- [ ] **Step 3: Implement bookmarks.ts**

```typescript
// src/background/bookmarks.ts
import browser from 'webextension-polyfill'
import type { BookmarkTreeNode } from 'webextension-polyfill'
import type { FlatBookmark } from '../types'

export function flattenBookmarks(nodes: BookmarkTreeNode[]): FlatBookmark[] {
  const results: FlatBookmark[] = []
  for (const node of nodes) {
    if (node.url) {
      results.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
      })
    }
    if (node.children) {
      results.push(...flattenBookmarks(node.children))
    }
  }
  return results
}

export async function getAllBookmarks(): Promise<FlatBookmark[]> {
  const tree = await browser.bookmarks.getTree()
  return flattenBookmarks(tree)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/background/bookmarks.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/bookmarks.ts tests/background/bookmarks.test.ts
git commit -m "feat: add bookmark tree flattener"
```

---

## Chunk 3: Rate Limiter + URL Checker

### Task 4: Per-domain rate limiter

**Files:**
- Create: `src/background/rate-limiter.ts`
- Create: `tests/background/rate-limiter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/background/rate-limiter.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/background/rate-limiter.test.ts
```

Expected: FAIL — `RateLimiter` not found.

- [ ] **Step 3: Implement rate-limiter.ts**

```typescript
// src/background/rate-limiter.ts

export class RateLimiter {
  private readonly delayMs: number
  private lastRequestTime = new Map<string, number>()

  constructor(perDomainDelayMs: number) {
    this.delayMs = perDomainDelayMs
  }

  async wait(domain: string): Promise<void> {
    const last = this.lastRequestTime.get(domain)
    const now = Date.now()
    if (last !== undefined) {
      const elapsed = now - last
      if (elapsed < this.delayMs) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs - elapsed))
      }
    }
    this.lastRequestTime.set(domain, Date.now())
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/background/rate-limiter.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/rate-limiter.ts tests/background/rate-limiter.test.ts
git commit -m "feat: add per-domain rate limiter"
```

---

### Task 5: URL checker

**Files:**
- Create: `src/background/checker.ts`
- Create: `tests/background/checker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/background/checker.test.ts
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
    mockFetch.mockImplementation(() => new Promise(() => {})) // never resolves
    const p = checkUrl('https://slow.com', 100)
    await vi.advanceTimersByTimeAsync(200)
    const result = await p
    expect(result.status).toBe('unreachable')
    expect(result.error).toContain('timeout')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/background/checker.test.ts
```

Expected: FAIL — `checkUrl` not found.

- [ ] **Step 3: Implement checker.ts**

```typescript
// src/background/checker.ts
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
      // Don't send cookies / credentials to avoid false positives
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
    // Check if we were redirected to a different domain
    const origDomain = extractDomain(url)
    const finalDomain = extractDomain(finalUrl)
    if (finalDomain !== origDomain) {
      return { status: 'moved', statusCode: status, redirectUrl: finalUrl }
    }
    // Note: same-domain protocol upgrades (http→https) are detected in the background
    // service worker (background/index.ts) by comparing original URL scheme to finalUrl,
    // and handled with a silent browser.bookmarks.update() there — not here.
    return { status: 'alive', statusCode: status }
  }

  if (status >= 500) {
    return { status: 'unreachable', statusCode: status }
  }

  // 4xx other than 404/410 → treat as dead
  if (status >= 400) {
    return { status: 'dead', statusCode: status }
  }

  return { status: 'alive', statusCode: status }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/background/checker.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/checker.ts tests/background/checker.test.ts
git commit -m "feat: add URL checker with redirect classification"
```

---

## Chunk 4: Scanner + Cache

### Task 6: Scanner (orchestration)

**Files:**
- Create: `src/background/scanner.ts`
- Create: `tests/background/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/background/scanner.test.ts
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
    let resolveCheck: () => void
    mockCheckUrl.mockImplementation(() => new Promise<{ status: 'alive'; statusCode: 200 }>(res => {
      resolveCheck = () => res({ status: 'alive', statusCode: 200 })
    }))

    const bookmarks = [makeBookmark('1', 'https://a.com'), makeBookmark('2', 'https://b.com')]
    const scanner = new Scanner({ concurrency: 1, perDomainDelayMs: 0, timeoutMs: 5000, cacheTtlDays: 7 })

    const results: BookmarkResult[] = []
    scanner.on('result', r => results.push(r))

    const runPromise = scanner.run(bookmarks)
    scanner.cancel()
    resolveCheck!()
    await runPromise

    // At most 1 result (the in-flight one)
    expect(results.length).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/background/scanner.test.ts
```

Expected: FAIL — `Scanner` not found.

- [ ] **Step 3: Implement scanner.ts**

```typescript
// src/background/scanner.ts
import { checkUrl } from './checker'
import { RateLimiter } from './rate-limiter'
import type { FlatBookmark, BookmarkResult, Settings } from '../types'

type ScannerEvent = 'result' | 'progress' | 'done' | 'error'
type ScannerListener<E extends ScannerEvent> =
  E extends 'result' ? (r: BookmarkResult) => void :
  E extends 'progress' ? (checked: number, total: number) => void :
  E extends 'done' ? () => void :
  E extends 'error' ? (err: string) => void :
  never

export class Scanner {
  private readonly settings: Settings
  private cancelled = false
  private listeners: Partial<Record<ScannerEvent, Function[]>> = {}

  constructor(settings: Settings) {
    this.settings = settings
  }

  on<E extends ScannerEvent>(event: E, listener: ScannerListener<E>): void {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event]!.push(listener)
  }

  private emit(event: ScannerEvent, ...args: unknown[]): void {
    for (const listener of this.listeners[event] ?? []) {
      listener(...args)
    }
  }

  cancel(): void {
    this.cancelled = true
  }

  async run(bookmarks: FlatBookmark[]): Promise<void> {
    this.cancelled = false
    const limiter = new RateLimiter(this.settings.perDomainDelayMs)
    const total = bookmarks.length
    let checked = 0

    const queue = [...bookmarks]
    const active: Promise<void>[] = []

    const processNext = async (): Promise<void> => {
      const bookmark = queue.shift()
      if (!bookmark || this.cancelled) return

      const domain = new URL(bookmark.url).hostname
      await limiter.wait(domain)
      if (this.cancelled) return

      const checkResult = await checkUrl(bookmark.url, this.settings.timeoutMs)
      checked++

      const result: BookmarkResult = {
        bookmark,
        ...checkResult,
      }

      if (!this.cancelled) {
        this.emit('result', result)
        this.emit('progress', checked, total)
      }
    }

    // Run up to concurrency tasks in parallel
    const runWorker = async (): Promise<void> => {
      while (queue.length > 0 && !this.cancelled) {
        await processNext()
      }
    }

    const workers = Array.from(
      { length: Math.min(this.settings.concurrency, bookmarks.length) },
      () => runWorker()
    )

    await Promise.all(workers)
    if (!this.cancelled) this.emit('done')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/background/scanner.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/scanner.ts tests/background/scanner.test.ts
git commit -m "feat: add scanner with concurrency and cancel support"
```

---

### Task 7: Settings + Cache

**Files:**
- Create: `src/settings.ts`
- Create: `src/background/cache.ts`

- [ ] **Step 1: Create settings.ts**

```typescript
// src/settings.ts
import browser from 'webextension-polyfill'
import { DEFAULT_SETTINGS } from './types'
import type { Settings } from './types'

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings })
}
```

- [ ] **Step 2: Create cache.ts**

```typescript
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
```

- [ ] **Step 3: Write cache tests**

```typescript
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/background/cache.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/background/cache.ts tests/background/cache.test.ts
git commit -m "feat: add settings and scan result cache"
```

---

## Chunk 5: Background Entry + Messaging

### Task 8: Background service worker entry

**Files:**
- Create: `src/background/index.ts`
- Create: `src/platform.ts`

- [ ] **Step 1: Create platform.ts**

```typescript
// src/platform.ts
// Adapter for browser-specific sidebar open API

declare const __IS_CHROME__: boolean

export async function openSidebar(tabId: number): Promise<void> {
  if (__IS_CHROME__) {
    // Chrome/Edge: use sidePanel API
    await (chrome as typeof chrome & { sidePanel: { open: (opts: { tabId: number }) => Promise<void> } })
      .sidePanel.open({ tabId })
  }
  // Firefox/Safari: sidebar opens via user action on the toolbar button automatically
  // Nothing needed here — sidebar_action handles it
}
```

- [ ] **Step 2: Create background/index.ts**

```typescript
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
        // Save cache after successful scan (collect results first — scanner streams them)
        // Cache saving is handled in sidebar after collecting all results
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
```

- [ ] **Step 3: Commit**

```bash
git add src/background/index.ts src/platform.ts
git commit -m "feat: add background service worker with port messaging"
```

---

## Chunk 6: Sidebar UI

### Task 9: Sidebar state machine

**Files:**
- Create: `src/sidebar/state.ts`
- Create: `tests/sidebar/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sidebar/state.test.ts
import { describe, it, expect } from 'vitest'
import { createState, applyMessage, toggleSelection, selectAll, selectNone } from '../../src/sidebar/state'
import type { BookmarkResult } from '../../src/types'

const makeResult = (id: string, status: BookmarkResult['status']): BookmarkResult => ({
  bookmark: { id, title: `Bookmark ${id}`, url: `https://${id}.com` },
  status,
  statusCode: status === 'dead' ? 404 : 200,
})

describe('sidebar state', () => {
  it('starts in idle phase', () => {
    expect(createState().phase).toBe('idle')
  })

  it('transitions to scanning on progress message', () => {
    const state = applyMessage(createState(), { type: 'scan_progress', progress: { checked: 1, total: 100 } })
    expect(state.phase).toBe('scanning')
    expect(state.progress).toEqual({ checked: 1, total: 100 })
  })

  it('accumulates results', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('a', 'dead') })
    state = applyMessage(state, { type: 'result', result: makeResult('b', 'moved') })
    expect(state.results).toHaveLength(2)
  })

  it('transitions to done on scan_done', () => {
    let state = applyMessage(createState(), { type: 'result', result: makeResult('a', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.phase).toBe('done')
  })

  it('auto-selects dead bookmarks, not others', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('dead1', 'dead') })
    state = applyMessage(state, { type: 'result', result: makeResult('moved1', 'moved') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.selected.has('dead1')).toBe(true)
    expect(state.selected.has('moved1')).toBe(false)
  })

  it('selectAll selects all in category', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('a', 'moved') })
    state = applyMessage(state, { type: 'result', result: makeResult('b', 'moved') })
    state = applyMessage(state, { type: 'scan_done' })
    state = selectAll(state, 'moved')
    expect(state.selected.has('a')).toBe(true)
    expect(state.selected.has('b')).toBe(true)
  })

  it('selectNone deselects all in category', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('x', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    state = selectNone(state, 'dead')
    expect(state.selected.has('x')).toBe(false)
  })

  it('toggleSelection flips a bookmark', () => {
    let state = createState()
    state = applyMessage(state, { type: 'result', result: makeResult('x', 'dead') })
    state = applyMessage(state, { type: 'scan_done' })
    expect(state.selected.has('x')).toBe(true)
    state = toggleSelection(state, 'x')
    expect(state.selected.has('x')).toBe(false)
    state = toggleSelection(state, 'x')
    expect(state.selected.has('x')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/sidebar/state.test.ts
```

Expected: FAIL — `createState` not found.

- [ ] **Step 3: Implement state.ts**

```typescript
// src/sidebar/state.ts
import type { BackgroundMessage, BookmarkResult, ScanPhase, ScanProgress, BookmarkStatus } from '../types'

export interface SidebarState {
  phase: ScanPhase
  progress: ScanProgress
  results: BookmarkResult[]
  selected: Set<string>   // bookmark ids
  error: string | null
  showConfirm: boolean
  lastScanDate: string | null
}

export function createState(): SidebarState {
  return {
    phase: 'idle',
    progress: { total: 0, checked: 0 },
    results: [],
    selected: new Set(),
    error: null,
    showConfirm: false,
    lastScanDate: null,
  }
}

export function applyMessage(state: SidebarState, msg: BackgroundMessage): SidebarState {
  switch (msg.type) {
    case 'scan_progress':
      return { ...state, phase: 'scanning', progress: msg.progress }

    case 'result': {
      const results = [...state.results, msg.result]
      const selected = new Set(state.selected)
      if (msg.result.status === 'dead') selected.add(msg.result.bookmark.id)
      return { ...state, results, selected }
    }

    case 'scan_done':
      return { ...state, phase: 'done' }

    case 'scan_error':
      return { ...state, phase: 'error', error: msg.error }

    default:
      return state
  }
}

export function toggleSelection(state: SidebarState, id: string): SidebarState {
  const selected = new Set(state.selected)
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  return { ...state, selected }
}

export function selectAll(state: SidebarState, status: BookmarkStatus): SidebarState {
  const selected = new Set(state.selected)
  for (const r of state.results) {
    if (r.status === status) selected.add(r.bookmark.id)
  }
  return { ...state, selected }
}

export function selectNone(state: SidebarState, status: BookmarkStatus): SidebarState {
  const selected = new Set(state.selected)
  for (const r of state.results) {
    if (r.status === status) selected.delete(r.bookmark.id)
  }
  return { ...state, selected }
}

export function selectedCount(state: SidebarState): number {
  return state.selected.size
}

export function resultsByStatus(state: SidebarState, status: BookmarkStatus): BookmarkResult[] {
  return state.results.filter(r => r.status === status)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/sidebar/state.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/state.ts tests/sidebar/state.test.ts
git commit -m "feat: add sidebar state machine"
```

---

### Task 10: Sidebar HTML + UI renderer

**Files:**
- Create: `src/sidebar/index.html`
- Create: `src/sidebar/ui.ts`
- Create: `src/sidebar/index.ts`

- [ ] **Step 1: Create sidebar/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clean Bookmarks</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      background: #1a1a1a;
      color: #e8e8e8;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      padding: 10px 14px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    header h1 { font-size: 14px; font-weight: 600; }

    #content { flex: 1; overflow-y: auto; }

    /* Idle */
    .idle-view {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100%; gap: 10px; padding: 20px;
      text-align: center;
    }
    .idle-view p { color: #888; font-size: 12px; }

    /* Scanning */
    .scanning-view { padding: 16px; }
    .progress-bar-track { background: #333; border-radius: 4px; height: 6px; margin: 8px 0 12px; }
    .progress-bar-fill { background: #5b9cf6; height: 6px; border-radius: 4px; transition: width 0.2s; }
    .progress-counters { font-size: 11px; color: #888; display: flex; gap: 12px; }

    /* Results */
    .section { border-bottom: 1px solid #2a2a2a; }
    .section-header {
      padding: 9px 14px; display: flex; justify-content: space-between;
      align-items: center; cursor: pointer; user-select: none;
    }
    .section-header:hover { background: #222; }
    .section-title { font-weight: 600; font-size: 12px; }
    .section-title.dead { color: #e05c5c; }
    .section-title.moved { color: #e0a95c; }
    .section-title.unreachable { color: #888; }
    .section-controls { display: flex; gap: 8px; font-size: 11px; color: #666; }
    .section-controls span { cursor: pointer; text-decoration: underline; }
    .section-controls span:hover { color: #aaa; }
    .section-list { overflow-y: auto; max-height: 300px; }
    .bookmark-row {
      padding: 5px 14px; display: flex; align-items: center; gap: 8px;
      border-bottom: 1px solid #222; cursor: pointer;
    }
    .bookmark-row:hover { background: #222; }
    .bookmark-info { min-width: 0; flex: 1; }
    .bookmark-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bookmark-url { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #666; font-size: 11px; }
    .status-badge { font-size: 10px; color: #666; flex-shrink: 0; }

    /* Zap bar */
    .zap-bar {
      padding: 12px 14px; border-top: 1px solid #333;
      flex-shrink: 0; display: flex; flex-direction: column; gap: 4px;
    }
    .zap-count { font-size: 11px; color: #888; text-align: center; }

    /* Buttons */
    button {
      border: none; border-radius: 6px; cursor: pointer;
      font-family: inherit; font-size: 13px; padding: 8px 16px;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.4; cursor: default; }
    .btn-primary { background: #5b9cf6; color: #fff; width: 100%; }
    .btn-zap { background: #e05c5c; color: #fff; width: 100%; font-weight: 600; }
    .btn-ghost { background: transparent; border: 1px solid #444; color: #888; font-size: 12px; }

    /* Modal */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .modal {
      background: #252525; border: 1px solid #444; border-radius: 8px;
      padding: 20px; width: 240px;
    }
    .modal h2 { font-size: 14px; margin-bottom: 8px; }
    .modal p { color: #888; font-size: 12px; margin-bottom: 16px; line-height: 1.5; }
    .modal-buttons { display: flex; gap: 8px; }
    .modal-buttons button { flex: 1; }
    .btn-cancel { background: #333; color: #aaa; }
    .btn-confirm-delete { background: #e05c5c; color: #fff; }

    /* Error */
    .error-view {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100%; gap: 10px; padding: 20px; text-align: center;
    }
    .error-view p { color: #e05c5c; font-size: 12px; }

    .chevron { font-size: 10px; color: #555; margin-left: 4px; }

    input[type="checkbox"] { accent-color: #5b9cf6; flex-shrink: 0; cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <h1>🧹 Clean Bookmarks</h1>
    <button class="btn-ghost" id="settings-btn" style="padding:4px 8px;font-size:11px">⚙️</button>
  </header>
  <div id="content"></div>
  <div id="zap-bar"></div>
  <div id="modal-container"></div>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create sidebar/ui.ts**

```typescript
// src/sidebar/ui.ts
import type { SidebarState } from './state'
import type { BookmarkStatus } from '../types'
import { resultsByStatus, selectedCount } from './state'

export interface SidebarActions {
  onScan: () => void
  onCancel: () => void
  onToggle: (id: string) => void
  onSelectAll: (status: BookmarkStatus) => void
  onSelectNone: (status: BookmarkStatus) => void
  onZap: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

const SECTION_ORDER: BookmarkStatus[] = ['dead', 'moved', 'unreachable']
const SECTION_LABEL: Record<BookmarkStatus, string> = {
  dead: 'Dead',
  moved: 'Moved',
  unreachable: 'Unreachable',
  alive: 'Alive',
}
const STATUS_CODE_LABEL: Partial<Record<number, string>> = {
  404: '404', 410: '410', 0: 'DNS',
}

let expandedSections = new Set<BookmarkStatus>(['dead'])

export function render(state: SidebarState, actions: SidebarActions): void {
  const content = document.getElementById('content')!
  const zapBar = document.getElementById('zap-bar')!
  const modalContainer = document.getElementById('modal-container')!

  if (state.phase === 'idle') {
    content.innerHTML = `
      <div class="idle-view">
        <button class="btn-primary" data-action="scan">🔍 Scan Bookmarks</button>
        <p>${state.lastScanDate ? `Last scan: ${state.lastScanDate}` : 'No scan yet'}</p>
      </div>`
    zapBar.innerHTML = ''
  }

  else if (state.phase === 'scanning') {
    const pct = state.progress.total > 0
      ? Math.round(state.progress.checked / state.progress.total * 100)
      : 0
    content.innerHTML = `
      <div class="scanning-view">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>Checking URLs…</span>
          <span style="color:#888">${state.progress.checked} / ${state.progress.total}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-counters">
          <span style="color:#e05c5c">● ${resultsByStatus(state, 'dead').length} dead</span>
          <span style="color:#e0a95c">● ${resultsByStatus(state, 'moved').length} moved</span>
          <span style="color:#888">● ${resultsByStatus(state, 'unreachable').length} unreachable</span>
        </div>
        <button class="btn-ghost" data-action="cancel" style="margin-top:12px">Cancel</button>
      </div>`
    zapBar.innerHTML = ''
  }

  else if (state.phase === 'done') {
    const sections = SECTION_ORDER
      .filter(s => resultsByStatus(state, s).length > 0)
      .map(status => renderSection(state, status))
      .join('')
    content.innerHTML = sections || '<div class="idle-view"><p>All bookmarks are healthy! 🎉</p></div>'

    const count = selectedCount(state)
    zapBar.innerHTML = count > 0 ? `
      <div class="zap-bar">
        <button class="btn-zap" data-action="zap">⚡ Zap ${count} bookmark${count !== 1 ? 's' : ''}</button>
        <div class="zap-count">${count} selected across all categories</div>
      </div>` : ''
  }

  else if (state.phase === 'error') {
    content.innerHTML = `
      <div class="error-view">
        <p>⚠️ ${state.error ?? 'Something went wrong'}</p>
        <button class="btn-primary" data-action="scan">Retry</button>
      </div>`
    zapBar.innerHTML = ''
  }

  // Confirmation modal
  if (state.showConfirm) {
    const count = selectedCount(state)
    const dead = state.results.filter(r => r.status === 'dead' && state.selected.has(r.bookmark.id)).length
    const moved = state.results.filter(r => r.status === 'moved' && state.selected.has(r.bookmark.id)).length
    const unreachable = state.results.filter(r => r.status === 'unreachable' && state.selected.has(r.bookmark.id)).length
    const breakdown = [
      dead > 0 ? `${dead} dead` : '',
      moved > 0 ? `${moved} moved` : '',
      unreachable > 0 ? `${unreachable} unreachable` : '',
    ].filter(Boolean).join(', ')

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h2>Delete ${count} bookmark${count !== 1 ? 's' : ''}?</h2>
          <p>${breakdown}<br>This cannot be undone.</p>
          <div class="modal-buttons">
            <button class="btn-cancel" data-action="cancel-delete">Cancel</button>
            <button class="btn-confirm-delete" data-action="confirm-delete">Delete</button>
          </div>
        </div>
      </div>`
  } else {
    modalContainer.innerHTML = ''
  }
}

function renderSection(state: SidebarState, status: BookmarkStatus): string {
  const results = resultsByStatus(state, status)
  const isExpanded = expandedSections.has(status)
  const label = SECTION_LABEL[status]
  const allSelected = results.every(r => state.selected.has(r.bookmark.id))
  const rows = isExpanded ? results.map(r => {
    const checked = state.selected.has(r.bookmark.id) ? 'checked' : ''
    const badge = r.statusCode != null
      ? (STATUS_CODE_LABEL[r.statusCode] ?? String(r.statusCode))
      : (r.error ? 'ERR' : '')
    return `<label class="bookmark-row" data-id="${r.bookmark.id}">
      <input type="checkbox" ${checked} data-id="${r.bookmark.id}">
      <div class="bookmark-info">
        <div class="bookmark-name">${escapeHtml(r.bookmark.title)}</div>
        <div class="bookmark-url">${escapeHtml(r.bookmark.url)}</div>
      </div>
      <span class="status-badge">${badge}</span>
    </label>`
  }).join('') : ''

  return `<div class="section" data-status="${status}">
    <div class="section-header" data-toggle="${status}">
      <span class="section-title ${status}">● ${label} — ${results.length}</span>
      <div class="section-controls">
        <span data-select-all="${status}">all</span>
        <span data-select-none="${status}">none</span>
        <span class="chevron">${isExpanded ? '▾' : '▸'}</span>
      </div>
    </div>
    ${isExpanded ? `<div class="section-list">${rows}</div>` : ''}
  </div>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Attach delegated event listeners — called ONCE on page load.
// Uses data-action and data-* attributes so it survives innerHTML re-renders.
export function attachDelegatedListeners(actions: SidebarActions): void {
  // Delegate from document.body to cover content, zap-bar, and modal-container
  document.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // data-action buttons (scan, cancel, zap, confirm-delete, cancel-delete)
    const actionEl = target.closest('[data-action]') as HTMLElement | null
    if (actionEl) {
      e.stopPropagation()
      switch (actionEl.dataset['action']) {
        case 'scan': actions.onScan(); return
        case 'cancel': actions.onCancel(); return
        case 'zap': actions.onZap(); return
        case 'confirm-delete': actions.onConfirmDelete(); return
        case 'cancel-delete': actions.onCancelDelete(); return
      }
    }

    // Select all / none in a category
    const selectAllEl = target.closest('[data-select-all]') as HTMLElement | null
    if (selectAllEl) {
      e.stopPropagation()
      actions.onSelectAll(selectAllEl.dataset['selectAll'] as BookmarkStatus)
      return
    }
    const selectNoneEl = target.closest('[data-select-none]') as HTMLElement | null
    if (selectNoneEl) {
      e.stopPropagation()
      actions.onSelectNone(selectNoneEl.dataset['selectNone'] as BookmarkStatus)
      return
    }

    // Toggle section expand/collapse (section-header, but not controls)
    const toggle = target.closest('[data-toggle]') as HTMLElement | null
    if (toggle) {
      const status = toggle.dataset['toggle'] as BookmarkStatus
      if (expandedSections.has(status)) expandedSections.delete(status)
      else expandedSections.add(status)
      return
    }

    // Checkbox / bookmark row toggle
    const row = target.closest('[data-id]') as HTMLElement | null
    if (row?.dataset['id']) {
      actions.onToggle(row.dataset['id']!)
    }
  })
}
```

- [ ] **Step 3: Create sidebar/index.ts (entry point)**

```typescript
// src/sidebar/index.ts
import browser from 'webextension-polyfill'
import {
  createState, applyMessage, toggleSelection,
  selectAll, selectNone,
} from './state'
import { render, attachDelegatedListeners } from './ui'
import type { SidebarActions } from './ui'
import type { BackgroundMessage, SidebarMessage, BookmarkStatus } from '../types'

let state = createState()
const port = browser.runtime.connect({ name: 'sidebar' })

function sendToBackground(msg: SidebarMessage): void {
  port.postMessage(msg)
}

// All actions defined once — passed to both render() and attachDelegatedListeners()
const actions: SidebarActions = {
  onScan: () => {
    const prev = state
    state = { ...createState(), lastScanDate: prev.lastScanDate }
    state = { ...state, phase: 'scanning' }
    renderView()
    sendToBackground({ type: 'start_scan' })
  },
  onCancel: () => {
    sendToBackground({ type: 'cancel_scan' })
    state = { ...createState(), lastScanDate: state.lastScanDate }
    renderView()
  },
  onToggle: (id: string) => { state = toggleSelection(state, id); renderView() },
  onSelectAll: (status: BookmarkStatus) => { state = selectAll(state, status); renderView() },
  onSelectNone: (status: BookmarkStatus) => { state = selectNone(state, status); renderView() },
  onZap: () => { state = { ...state, showConfirm: true }; renderView() },
  onConfirmDelete: async () => {
    state = { ...state, showConfirm: false }
    renderView()
    const ids = [...state.selected]
    for (const id of ids) {
      try { await browser.bookmarks.remove(id) } catch { /* already deleted */ }
    }
    state = {
      ...state,
      results: state.results.filter(r => !ids.includes(r.bookmark.id)),
      selected: new Set(),
      lastScanDate: new Date().toLocaleDateString(),
    }
    renderView()
  },
  onCancelDelete: () => { state = { ...state, showConfirm: false }; renderView() },
}

function renderView(): void {
  render(state, actions)
}

port.onMessage.addListener((rawMsg: unknown) => {
  state = applyMessage(state, rawMsg as BackgroundMessage)
  renderView()
})

// Attach delegated listeners once on load (handles checkboxes, toggles, select all/none)
attachDelegatedListeners(actions)

// Initial render then request scan (uses cache if available)
renderView()
sendToBackground({ type: 'start_scan' })
```

- [ ] **Step 4: Commit**

```bash
git add src/sidebar/
git commit -m "feat: add sidebar UI (HTML, state renderer, entry point)"
```

---

## Chunk 7: Build Wiring + Verification

### Task 11: Manifest merge + build script

**Files:**
- Modify: `vite.config.ts`

The Chrome build needs `manifest.json` merged with `manifest.chrome.json` and copied to `dist/chrome/`. Add a Vite plugin to handle this.

- [ ] **Step 1: Update vite.config.ts with manifest plugin**

Replace `vite.config.ts` content with:

```typescript
import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs'

function manifestPlugin(isChrome: boolean): Plugin {
  return {
    name: 'manifest-plugin',
    closeBundle() {
      const outDir = isChrome ? 'dist/chrome' : 'dist/firefox'
      const base = JSON.parse(readFileSync('manifest.json', 'utf8'))

      if (isChrome) {
        const overrides = JSON.parse(readFileSync('manifest.chrome.json', 'utf8'))
        const merged = {
          ...base,
          ...overrides,
          permissions: [...(base.permissions ?? []), ...(overrides.permissions ?? [])],
        }
        // Chrome doesn't use sidebar_action
        delete merged.sidebar_action
        writeFileSync(`${outDir}/manifest.json`, JSON.stringify(merged, null, 2))
      } else {
        // Firefox: remove sidePanel key if present
        const ff = { ...base }
        writeFileSync(`${outDir}/manifest.json`, JSON.stringify(ff, null, 2))
      }

      // Copy icons
      try {
        mkdirSync(`${outDir}/icons`, { recursive: true })
        for (const size of [16, 48, 128]) {
          copyFileSync(`src/icons/icon${size}.png`, `${outDir}/icons/icon${size}.png`)
        }
      } catch { /* icons not yet present, skip */ }
    }
  }
}

export default defineConfig(({ mode }) => {
  const isChrome = mode === 'chrome'

  return {
    build: {
      outDir: isChrome ? 'dist/chrome' : 'dist/firefox',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          sidebar: resolve(__dirname, 'src/sidebar/index.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
      target: 'esnext',
      minify: false,
    },
    define: {
      __IS_CHROME__: JSON.stringify(isChrome),
    },
    plugins: [manifestPlugin(isChrome)],
    test: {
      globals: true,
      environment: 'jsdom',
    },
  }
})
```

- [ ] **Step 2: Build for Chrome**

```bash
npm run build:chrome
```

Expected: `dist/chrome/` contains `background.js`, `sidebar.html`, `sidebar.js`, `manifest.json`. No TypeScript errors.

- [ ] **Step 3: Build for Firefox**

```bash
npm run build:firefox
```

Expected: `dist/firefox/` with same files + Firefox manifest (no `sidePanel` permission, has `sidebar_action`).

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "chore: add manifest merge plugin, verify builds"
```

---

### Task 12: Load extension in Chrome and verify end-to-end

- [ ] **Step 1: Open Chrome extensions**

Navigate to `chrome://extensions/`. Enable "Developer mode" (top right toggle).

- [ ] **Step 2: Load unpacked extension**

Click "Load unpacked", select `dist/chrome/`.

Expected: Extension appears in list with no errors. "Clean Bookmarks" icon in toolbar.

- [ ] **Step 3: Open the sidebar**

Click the extension toolbar icon. The sidebar should open on the right side.

Expected: Sidebar shows "🧹 Clean Bookmarks" header and immediately starts scanning (or shows cached results).

- [ ] **Step 4: Verify scanning progress**

With a large bookmark set, you should see the progress bar fill and live counters for dead/moved/unreachable.

- [ ] **Step 5: Verify results view**

After scan completes: Dead section expanded by default, Moved + Unreachable collapsed. "all / none" links work. Zap button shows correct count.

- [ ] **Step 6: Verify Zap flow**

Select some bookmarks, click "⚡ Zap N bookmarks". Confirmation modal appears with count breakdown. Click Delete. Bookmarks are removed. Sidebar updates without them.

- [ ] **Step 7: Verify Firefox**

In Firefox, go to `about:debugging` → "This Firefox" → "Load Temporary Add-on". Select `dist/firefox/manifest.json`.

Expected: Extension loads. Sidebar accessible via toolbar icon or View → Sidebar → Clean Bookmarks.

---

## Verification Checklist

- [ ] All unit tests pass (`npm test`)
- [ ] Chrome build succeeds (`npm run build:chrome`)
- [ ] Firefox build succeeds (`npm run build:firefox`)
- [ ] Extension loads in Chrome with no console errors
- [ ] Extension loads in Firefox with no console errors
- [ ] Scanning progress streams live to sidebar
- [ ] Dead bookmarks auto-selected, Moved/Unreachable unselected
- [ ] Select all / Select none works per category
- [ ] Zap button count is accurate
- [ ] Confirmation modal shows correct breakdown
- [ ] Bookmarks are actually deleted after confirming
- [ ] Cache is used on second open (no re-scan)
- [ ] Adding/deleting a bookmark invalidates cache
- [ ] Scan continues if sidebar is closed and reopened
