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
