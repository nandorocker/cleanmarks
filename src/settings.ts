// src/settings.ts
import browser from 'webextension-polyfill'
import { DEFAULT_SETTINGS } from './types'
import type { Settings } from './types'

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings')
  const settings = { ...DEFAULT_SETTINGS, ...(stored['settings'] as Partial<Settings> ?? {}) }
  const bounded = (value: number, fallback: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback
  return { concurrency: bounded(settings.concurrency, 5, 1, 10),
    perDomainDelayMs: bounded(settings.perDomainDelayMs, 1000, 0, 60000),
    timeoutMs: bounded(settings.timeoutMs, 10000, 100, 30000), cacheTtlDays: 7 }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings })
}
