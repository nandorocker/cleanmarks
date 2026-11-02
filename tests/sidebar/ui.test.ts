import { describe, expect, it } from 'vitest'
import { renderApp } from '../../src/sidebar/ui'
import type { AppView } from '../../src/sidebar/ui'
import { createState, applyMessage, selectRange } from '../../src/sidebar/state'
import type { BookmarkResult } from '../../src/types'

describe('review UI', () => {
  it('gives About an app identity and credit rows, using the bounce.nan.do coffee artwork consistently', () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'complete', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(), mode: 'move', busy: false, loading: false, notice: '', confirm: false, motionEnabled: false, version: '0.1.0',
      completion: { mode: 'move', bookmarks: [{ id: '1', title: 'Link', url: 'https://example.com' }], remaining: 0 } }
    renderApp(root, createState(), view)
    const coffee = root.querySelector('.support .coffee-icon')!.outerHTML
    view.about = true
    renderApp(root, createState(), view)
    const about = root.querySelector('.about-dialog')!
    expect(about.querySelector('.about-identity h2')!.textContent).toBe('Cleanmarks')
    expect(about.querySelector('.about-identity .app-icon')!.getAttribute('src')).toBe('../../icons/icon128.png')
    expect(about.querySelector('.about-version')!.textContent).toBe('Version 0.1.0')
    expect(about.querySelectorAll('.about-credits li')).toHaveLength(2)
    expect(about.querySelector('.about-coffee .coffee-icon')!.outerHTML).toBe(coffee)
    expect(about.querySelector('.coffee-icon path')!.getAttribute('d')).toBe('M5 8h14l-1.5 9A2 2 0 0 1 15.52 19H8.48A2 2 0 0 1 6.5 17L5 8Z')
    expect(about.querySelector('[data-action="close_about"]')!.getAttribute('aria-label')).toBe('Close about')
    expect(root.textContent).not.toContain('☕')
  })

  it.each<[Partial<BookmarkResult>, string, string]>([
    [{ status: 'dead', statusCode: 404 }, '404 · Not found', 'may be temporary'],
    [{ status: 'dead', statusCode: 410 }, '410 · Gone', 'has been removed'],
    [{ statusCode: 401 }, '401 · Login required', 'requested authentication'],
    [{ statusCode: 403 }, '403 · Access denied', 'may block automated requests'],
    [{ statusCode: 429 }, '429 · Rate limited', 'too many requests'],
    [{ statusCode: 500 }, '500 · Server error', 'server error'],
    [{ statusCode: 503 }, '503 · Server error', 'server error'],
    [{ statusCode: 302 }, '302 · Unexpected response', 'unexpected response'],
    [{ statusCode: 418 }, '418 · Unexpected response', 'unexpected response'],
    [{ error: 'timeout after 10000ms' }, 'Timed out', 'did not respond in time'],
    [{ error: 'TypeError: Failed to fetch <script>bad</script>' }, 'Network error', 'cause is unknown'],
    [{}, 'Check failed', 'inconclusive'],
  ])('keeps $1 concise with explanations available on hover or click', (result, label, detail) => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'results', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(['dead', 'unreachable']), mode: 'move', busy: false, loading: false, notice: '', confirm: false }
    let state = applyMessage(createState(), { type: 'result', result: { bookmark: { id: '1', title: 'Link', url: 'https://example.com' }, status: 'unreachable', ...result } })
    state = applyMessage(state, { type: 'scan_done' })
    renderApp(root, state, view)
    const reason = root.querySelector<HTMLDetailsElement>('details.reason')!
    const summary = reason.querySelector('summary')!
    expect(summary.textContent).toBe(label)
    expect(summary.title).toContain(detail)
    expect(reason.querySelector('p')!.textContent).toBe(summary.title)
    expect(reason.open).toBe(false)
    summary.click()
    expect(reason.open).toBe(true)
    summary.click()
    expect(reason.open).toBe(false)
    expect(root.querySelector('script')).toBeNull()
    expect(root.textContent).not.toContain('Could not verify this page')
    expect(root.textContent).not.toContain('Couldn’t verify')
    if (result.status !== 'dead') {
      expect(root.querySelector('[data-status="unreachable"]')!.textContent).toContain('Needs review')
      expect(root.querySelector('.summary')!.textContent).toContain('1 needs review')
      expect(root.querySelector<HTMLInputElement>('[data-bookmark]')!.checked).toBe(false)
    }
  })

  it('uses a white header mark and the full-color app artwork for the success reveal', () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'complete', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(), mode: 'move', busy: false, loading: false, notice: '', confirm: false, motionEnabled: false,
      completion: { mode: 'move', bookmarks: [{ id: '1', title: 'Link', url: 'https://example.com' }], remaining: 0 } }
    renderApp(root, createState(), view)
    const headerIcon = root.querySelector('.brand svg.app-icon')!
    const successIcon = root.querySelector<HTMLImageElement>('.success-icon .app-icon')!
    expect(headerIcon.querySelector('path')!.getAttribute('fill')).toBe('currentColor')
    expect(headerIcon.querySelector('path')!.getAttribute('d')).toBe('M34 12h60a10 10 0 0 1 10 10v94L64 92l-40 24V22a10 10 0 0 1 10-10Z')
    expect(successIcon.getAttribute('src')).toBe('../../icons/icon128.png')
    expect(root.querySelector('.icon-starburst')).not.toBeNull()
    expect(root.querySelector('.success-icon')!.getAttribute('aria-hidden')).toBe('true')
    view.completion!.remaining = 1
    renderApp(root, createState(), view)
    expect(root.querySelector('.success-icon.partial')!.textContent).toBe('!')
    expect(root.querySelector('.success-icon .app-icon')).toBeNull()
    expect(root.querySelector('.icon-starburst')).toBeNull()
  })

  it('updates scanning progress in place, including while About is open', () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'results', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(), mode: 'move', busy: false, loading: false, notice: '', confirm: false, version: '0.1.0' }
    let state = { ...createState(), phase: 'scanning' as const, progress: { total: 100, checked: 0 } }
    renderApp(root, state, view)
    const cancel = root.querySelector('[data-action="cancel"]')!
    for (let checked = 1; checked <= 60; checked++) {
      state = { ...state, progress: { total: 100, checked } }
      renderApp(root, state, view)
      expect(root.querySelector('[data-action="cancel"]')).toBe(cancel)
    }
    expect(root.querySelector('progress')!.value).toBe(60)
    view.about = true
    renderApp(root, state, view)
    const close = root.querySelector('[data-action="close_about"]')!
    state.progress.checked = 61
    renderApp(root, state, view)
    expect(root.querySelector('[data-action="close_about"]')).toBe(close)
    expect(document.activeElement).toBe(close)
    expect(root.querySelector('[data-scan-count]')!.textContent).toBe('Checking 61 / 100')
  })

  it.each([0, 1, 4])('labels removal for %s selected bookmarks with correct pluralization', count => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'results', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(['dead']), mode: 'move', busy: false, loading: false, notice: '', confirm: false }
    let state = createState()
    for (let i = 0; i < 4; i++) {
      state = applyMessage(state, { type: 'result', result: { bookmark: { id: String(i), title: 'Link', url: 'https://example.com' }, status: 'dead' } })
    }
    state = applyMessage(state, { type: 'scan_done' })
    state.selected = new Set(Array.from({ length: count }, (_, i) => String(i)))
    for (const mode of ['move', 'delete'] as const) {
      view.mode = mode
      renderApp(root, state, view)
      expect(root.querySelector('[data-action="review"]')!.textContent).toBe(`Remove ${count} bookmark${count === 1 ? '' : 's'}`)
    }
  })

  it('defaults to dead only, but allows ranges across all review categories', () => {
    let state = createState()
    for (const [id, status] of [['1', 'dead'], ['2', 'unreachable'], ['3', 'moved'], ['4', 'alive']] as const) {
      state = applyMessage(state, { type: 'result', result: { bookmark: { id, title: id, url: `https://${id}.example` }, status } })
    }
    expect([...state.selected]).toEqual(['1'])
    state = selectRange(state, ['4', '3', '2', '1'], false)
    expect(state.selected.size).toBe(0)
    state = selectRange(state, ['4', '3', '2', '1'], true)
    expect([...state.selected]).toEqual(['3', '2', '1'])
  })

  it('renders safe links independently from selection and separates setup from review', () => {
    document.body.innerHTML = '<main id="app"></main>'
    const root = document.getElementById('app')!
    const view: AppView = { screen: 'results', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(['dead']), mode: 'move', busy: false, loading: false, notice: '<script>error</script>', confirm: false }
    let state = applyMessage(createState(), { type: 'result', result: { bookmark: { id: '1', title: '<b>Link</b>', url: 'https://example.com' }, status: 'dead', statusCode: 404 } })
    state = applyMessage(state, { type: 'scan_done' })
    renderApp(root, state, view)
    expect(root.querySelector('a')!.textContent).toBe('<b>Link</b>')
    expect(root.querySelector('a')!.target).toBe('_blank')
    expect(root.querySelector('a')!.closest('label')).toBeNull()
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector<HTMLInputElement>('[data-bookmark]')!.checked).toBe(true)
    expect(root.querySelector<HTMLInputElement>('#delete-mode')!.checked).toBe(false)
    const header = root.querySelector('header')!
    expect(header.querySelector('[data-action="folders"]')).toBeNull()
    const remove = root.querySelector('[data-action="review"]')!
    const cancel = root.querySelector('footer [data-action="folders"]')!
    expect(cancel.textContent).toBe('Cancel')
    expect(remove.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(header.querySelector('.title-row [data-action="scan"]')!.getAttribute('aria-label')).toBe('Scan again')
    expect(root.querySelector('.review-screen nav')).toBeNull()
    expect(root.querySelector('footer p')).toBeNull()
    expect(root.textContent).not.toContain('Shift-click selects a range')
    view.confirm = true
    renderApp(root, state, view)
    expect(root.querySelector('header')!.hasAttribute('inert')).toBe(true)
    expect(root.querySelector('dialog')!.textContent).toContain('You can move these back')
    view.confirm = false
    expect(root.querySelector('.folder-tree')).toBeNull()
    view.screen = 'folders'
    renderApp(root, state, view)
    expect(root.textContent).not.toContain('Deleted Bookmarks is excluded')
    expect(root.textContent).not.toContain('Selecting a folder includes')
    expect(root.querySelector('#results')).toBeNull()
    expect(root.querySelector('#delete-mode')).toBeNull()
    expect(root.querySelector('[data-action="review"]')).toBeNull()
    root.querySelector('.folder-tree')!.scrollTop = 160
    renderApp(root, state, view)
    expect(root.querySelector('.folder-tree')!.scrollTop).toBe(160)
    view.screen = 'results'
    renderApp(root, state, view)
    view.screen = 'folders'
    renderApp(root, state, view)
    expect(root.querySelector('.folder-tree')!.scrollTop).toBe(160)
  })
})
