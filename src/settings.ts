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
