# Clean Bookmarks — Design Spec

**Date:** 2026-03-10
**Status:** Approved

## Problem

Browsers accumulate dead bookmarks over time — sites go offline, domains expire, URLs change. There's no built-in way to find and remove them. Manually checking hundreds of bookmarks is impractical.

## Goal

A browser extension that scans your bookmarks, identifies dead/moved/unreachable URLs, and lets you delete them in bulk with one click — without requiring technical knowledge or any external service.

---

## Architecture

**Type:** Browser extension (no backend required)
**Target browsers:** Chrome, Firefox, Edge (Manifest V3), Safari (via Xcode converter)
**Tech stack:** TypeScript, Manifest V3, Vite, [`webextension-polyfill`](https://github.com/mozilla/webextension-polyfill)

All code uses the `browser.*` namespace via `webextension-polyfill`, which normalizes Chrome/Firefox/Edge differences. Safari uses the same codebase wrapped via Xcode's Safari Web Extension Converter.

### Sidebar Surface Per Browser

- **Chrome / Edge:** `chrome.sidePanel` API + `"sidePanel"` permission
- **Firefox:** `sidebar_action` manifest key (no special permission needed)
- **Safari:** `sidebar_action` manifest key (same as Firefox)

A thin adapter in `src/platform.ts` detects the browser and calls the right API to open the sidebar.

### Components

| Component | Role |
|-----------|------|
| **Sidebar panel** (`sidepanel/`) | Main UI — results, selection, zap button |
| **Background service worker** (`background/`) | Reads bookmarks, runs URL checks, streams results |
| **Storage** (`browser.storage.local`) | Caches scan results, persists settings |

### Data Flow

```
User opens sidebar
→ Background worker reads all bookmarks via browser.bookmarks.getTree()
→ URLs queued with per-domain rate limiter
→ HEAD request → follow redirects → classify
→ Results streamed to sidebar via long-lived port (browser.runtime.connect())
  background posts one message per result as it completes
→ User selects bookmarks to delete
→ Confirm modal → browser.bookmarks.remove() for each selected
```

---

## URL Checking Logic

**Per URL:**
1. Send HEAD request, follow redirects
2. If HEAD returns 405 (method not allowed), retry with GET
3. Classify:
   - `2xx` → alive, ignore
   - `301/302` same domain, protocol upgrade only (http→https) → silently update via `browser.bookmarks.update()`, no user action needed
   - `301/302` to different domain → **Moved**
   - `404`, `410`, DNS failure → **Dead**
   - Timeout, `503`, `429` → **Unreachable** (retry once after 30s)

**Rate limiting (smart defaults, no config required):**
- Max 5 concurrent requests
- Max 1 request per domain per second
- Automatic exponential backoff on `429`
- Request timeout: 10 seconds per URL (after which → Unreachable)
- Settings panel (gear icon in sidebar header) exposes: concurrency, per-domain delay, cache TTL, timeout. Stored in `browser.storage.local` under key `settings`.

---

## UI

### Sidebar States

**Error:** Shown if `bookmarks` permission is missing or the scan fails entirely. Shows a message with a button to grant permission or retry.

**Idle:** Shows bookmark count + "Scan Bookmarks" button + last scan date.

**Scanning:** Progress bar with live counters (X dead / Y moved / Z unreachable found so far). Cancel button.

**Results:** Three collapsible sections — Dead (expanded by default), Moved (collapsed), Unreachable (collapsed). Each section has "all / none" toggles. Scrollable list per section showing bookmark title, truncated URL, and status code. Single "⚡ Zap N bookmarks" button at bottom showing total selected count.

**Confirmation dialog** (custom modal, not `window.confirm`): Shows "Delete N bookmarks? This cannot be undone." with Cancel and Delete buttons. Lists count per category (e.g. "47 dead, 3 moved").

### Default Selection
- **Dead** — selected by default (safe to remove)
- **Moved** — unselected (user may want to update URL instead)
- **Unreachable** — unselected (may be temporary)

---

## Permissions Required

```json
["bookmarks", "storage", "sidePanel"]  // Chrome/Edge
["bookmarks", "storage"]               // Firefox/Safari (sidebar via manifest key, no permission)
```

Plus `host_permissions: ["<all_urls>"]` for the URL checking fetch calls.

---

## Scan Caching

Results cached in `browser.storage.local` with a timestamp. Default cache TTL: 7 days. Subsequent opens show cached results instantly with option to re-scan.

Cache is invalidated immediately on `browser.bookmarks.onCreated` and `browser.bookmarks.onRemoved` events — so added/deleted bookmarks are never shown stale.

---

## Out of Scope (v1)

- Updating moved bookmarks to their new URL (nice future feature)
- Duplicate bookmark detection
- Bookmark folders/organization
- Sync across devices
- Any backend or proxy service
