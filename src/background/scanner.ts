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
  private controller = new AbortController()
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
    this.controller.abort()
  }

  async run(bookmarks: FlatBookmark[]): Promise<void> {
    this.cancelled = false
    this.controller = new AbortController()
    const limiter = new RateLimiter(this.settings.perDomainDelayMs)
    const total = bookmarks.length
    let checked = 0

    const groups = new Map<string, FlatBookmark[]>()
    for (const bookmark of bookmarks) {
      const group = groups.get(bookmark.url) ?? []
      group.push(bookmark)
      groups.set(bookmark.url, group)
    }
    const queue = [...groups.values()]
    let cursor = 0

    const processNext = async (): Promise<void> => {
      const group = queue[cursor++]
      const bookmark = group?.[0]
      if (!bookmark || !group || this.cancelled) return

      const domain = new URL(bookmark.url).hostname
      await limiter.wait(domain, this.controller.signal)
      if (this.cancelled) return

      const checkResult = await checkUrl(bookmark.url, this.settings.timeoutMs, this.controller.signal)
      for (const bookmark of group) {
        checked++

        const result: BookmarkResult = { bookmark, ...checkResult }

        if (!this.cancelled) {
          this.emit('result', result)
          this.emit('progress', checked, total)
        }
      }
    }

    const runWorker = async (): Promise<void> => {
      while (cursor < queue.length && !this.cancelled) {
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
