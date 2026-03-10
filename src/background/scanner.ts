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
