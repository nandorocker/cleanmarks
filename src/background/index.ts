import browser from 'webextension-polyfill'
import { openSidebar } from '../platform'
import { cleanup, replaceQuarantine } from './cleanup'
import type { CleanupRequest } from '../types'

browser.action.onClicked.addListener(tab => {
  void openSidebar(tab.id).catch(console.error)
})

browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id !== browser.runtime.id) return
  const request = message as CleanupRequest | { type: 'replace_quarantine' }
  if (request.type === 'cleanup') return cleanup(request).then(outcome => ({ outcome }), err => ({ error: String(err) }))
  if (request.type === 'replace_quarantine') return replaceQuarantine().then(() => ({}), err => ({ error: String(err) }))
})
