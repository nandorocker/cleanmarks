export class RateLimiter {
  private nextSlot = new Map<string, number>()
  constructor(private readonly delayMs: number) {}

  async wait(domain: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return
    const now = Date.now()
    const slot = Math.max(now, this.nextSlot.get(domain) ?? now)
    this.nextSlot.set(domain, slot + this.delayMs)
    if (slot === now) return
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve() }
      const timer = setTimeout(finish, slot - now)
      signal?.addEventListener('abort', finish, { once: true })
      if (signal?.aborted) finish()
    })
  }
}
