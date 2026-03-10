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
