// src/platform.ts
// Adapter for browser-specific sidebar open API

import browser from 'webextension-polyfill'
declare const __IS_CHROME__: boolean

export async function syncSidebarTitle(): Promise<void> {
  if (!__IS_CHROME__ && browser.sidebarAction) {
    await browser.sidebarAction.setTitle({ title: 'Cleanmarks' })
  }
}

export async function openSidebar(tabId?: number): Promise<void> {
  if (__IS_CHROME__) {
    // Chrome/Edge: use sidePanel API
    if (tabId !== undefined) await chrome.sidePanel.open({ tabId })
  } else {
    await browser.sidebarAction.open()
  }
}
