import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ getTree: vi.fn(), get: vi.fn(), sendMessage: vi.fn(), checkUrl: vi.fn() }))
vi.mock('webextension-polyfill', () => ({ default: {
  bookmarks: { getTree: api.getTree }, storage: { local: { get: api.get } },
  runtime: { sendMessage: api.sendMessage, getManifest: () => ({ version: '0.1.0' }) },
} }))
vi.mock('../../src/background/checker', () => ({ checkUrl: api.checkUrl }))

const tree = () => [{ id: 'root', title: '', children: [{ id: 'folder', title: 'Work', parentId: 'root', children: [1, 2, 3].map(id => ({
  id: String(id), parentId: 'folder', index: id - 1, title: `Link ${id}`, url: `https://${id}.example`,
})) }] }]
const click = (selector: string, shiftKey = false) => document.querySelector<HTMLElement>(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }))
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  document.body.innerHTML = '<main id="app"></main>'
  api.getTree.mockResolvedValue(tree())
  api.get.mockImplementation(async (key: string) => key === 'settings' ? { settings: { perDomainDelayMs: 0 } } : {})
  api.checkUrl.mockResolvedValue({ status: 'dead', statusCode: 404 })
  await import('../../src/sidebar/index')
  await flush()
})
afterEach(() => { window.dispatchEvent(new Event('pagehide')) })

describe('sidebar workflow', () => {
  it('keeps Cancel clickable through 60 completed checks and stops with one click', async () => {
    vi.useFakeTimers()
    try {
      api.getTree.mockResolvedValue([{ id: 'root', title: '', children: [{ id: 'folder', title: 'Work', parentId: 'root', children: Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: String(i), parentId: 'folder', url: `https://example${i}.com` })) }] }])
      api.checkUrl.mockImplementation((url: string, _timeout, signal: AbortSignal) => {
        if (Number(url.match(/example(\d+)/)![1]) < 60) return Promise.resolve({ status: 'alive' })
        return new Promise(resolve => signal.addEventListener('abort', () => resolve({ status: 'unreachable' }), { once: true }))
      })
      click('[data-action="scan"]')
      const cancel = document.querySelector<HTMLButtonElement>('[data-action="cancel"]')!
      cancel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flush(); await flush()
      await vi.advanceTimersByTimeAsync(100)
      expect(document.querySelector('[data-scan-count]')!.textContent).toBe('Checking 60 / 100')
      expect(document.querySelector('[data-action="cancel"]')).toBe(cancel)
      cancel.click()
      await flush()
      expect(document.getElementById('app')!.dataset.screen).toBe('folders')
      await vi.advanceTimersByTimeAsync(1000)
      expect(document.getElementById('app')!.dataset.screen).toBe('folders')
    } finally { vi.useRealTimers() }
  })

  it('opens an accessible About popup with version and license credits, then restores focus', () => {
    const about = document.querySelector<HTMLButtonElement>('[data-action="about"]')!
    expect(about.textContent).toContain('v0.1.0')
    about.click()
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('Made with ❤️ by nando rossi')
    expect(dialog.textContent).toContain('©2026')
    expect(dialog.textContent).toContain('CodexBar')
    expect(dialog.textContent).toContain('MIT')
    expect(dialog.textContent).toContain('MPL-2.0')
    expect(document.querySelector('.setup-screen')!.hasAttribute('inert')).toBe(true)
    const links = dialog.querySelectorAll<HTMLAnchorElement>('a')
    links[links.length - 1]!.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(dialog.querySelector('[data-action="close_about"]'))
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-action="about"]'))
  })

  it('shows failures without celebrating and allows reviewing the still-selected items', async () => {
    click('[data-action="scan"]'); await flush()
    click('[data-action="review"]')
    api.sendMessage.mockResolvedValue({ outcome: { succeeded: [], failed: ['1', '2', '3'].map(id => ({ id, error: 'Denied' })) } })
    click('[data-action="confirm"]'); await flush()
    expect(document.body.textContent).toContain('Nothing removed yet')
    expect(document.body.textContent).not.toContain('Nice work!')
    expect(document.body.textContent).toContain('0 bookmarks moved to Deleted Bookmarks')
    click('[data-action="review_remaining"]')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(3)
  })

  it('keeps uncertain outcomes on the review screen instead of inventing a success', async () => {
    click('[data-action="scan"]'); await flush()
    click('[data-action="review"]')
    api.sendMessage.mockRejectedValue(new Error('Background disconnected'))
    click('[data-action="confirm"]'); await flush()
    expect(document.getElementById('app')!.dataset.screen).toBe('results')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(3)
    expect(document.body.textContent).not.toContain('Nice work!')
    expect(document.body.textContent).toContain('Background disconnected')
  })

  it('retains recovery warnings even when every requested move succeeded', async () => {
    click('[data-action="scan"]'); await flush()
    click('[data-action="review"]')
    api.sendMessage.mockResolvedValue({ outcome: { succeeded: ['1', '2', '3'], failed: [], warning: 'Recovery record could not be updated' } })
    click('[data-action="confirm"]'); await flush()
    expect(document.body.textContent).not.toContain('Nice work!')
    expect(document.body.textContent).toContain('3 bookmarks moved to Deleted Bookmarks')
    expect(document.body.textContent).toContain('Recovery record could not be updated')
  })

  it('offers Finish when the selected folders contain no HTTP(S) bookmarks', async () => {
    api.getTree.mockResolvedValue([{ id: 'root', title: '', children: [] }])
    click('[data-action="scan"]'); await flush()
    expect(document.querySelector('[data-action="finish"]')!.textContent).toBe('Finish')
    expect(document.querySelector('[data-action="folders"]')).toBeNull()
    click('[data-action="finish"]'); await flush()
    expect(document.getElementById('app')!.dataset.screen).toBe('folders')
  })

  it('toggles folder row whitespace without replacing controls or double-toggling labels', () => {
    const input = document.querySelector<HTMLInputElement>('[data-folder="folder"]')!
    const row = input.closest<HTMLElement>('.folder-row')!
    row.click()
    expect(input.checked).toBe(false)
    expect(document.querySelector('[data-folder="folder"]')).toBe(input)
    input.closest('label')!.click()
    expect(input.checked).toBe(true)
    input.click()
    expect(input.checked).toBe(false)
  })

  it('toggles result rows including metadata, supports shift-click, and leaves links independent', async () => {
    click('[data-action="scan"]'); await flush()
    const row = (id: string) => document.querySelector<HTMLInputElement>(`[data-bookmark="${id}"]`)!.closest<HTMLElement>('.bookmark-row')!
    row('1').click()
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="1"]')!.checked).toBe(false)
    row('3').querySelector('.bookmark-info')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    row('2').querySelector<HTMLElement>('.muted')!.click()
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="2"]')!.checked).toBe(true)
    const link = row('2').querySelector('a')!
    link.addEventListener('click', event => event.preventDefault(), { once: true })
    link.click()
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="2"]')!.checked).toBe(true)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(1)
  })

  it('opens result explanations without selecting or removing bookmarks', async () => {
    click('[data-action="scan"]'); await flush()
    const reason = document.querySelector<HTMLDetailsElement>('details.reason')!
    const summary = reason.querySelector('summary')!
    const selected = document.querySelectorAll('[data-bookmark]:checked').length
    summary.focus()
    expect(document.activeElement).toBe(summary)
    summary.click()
    expect(reason.open).toBe(true)
    expect(reason.querySelector('p')!.textContent).toContain('may be temporary')
    click('details.reason p')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(selected)
    expect(api.sendMessage).not.toHaveBeenCalled()
    summary.click()
    expect(reason.open).toBe(false)
  })

  it('puts Cancel after scan progress and returns to setup without cleanup', async () => {
    api.checkUrl.mockImplementation(() => new Promise(() => {}))
    click('[data-action="scan"]'); await flush()
    const progress = document.querySelector('progress')!
    const cancel = document.querySelector('[data-action="cancel"]')!
    expect(cancel.textContent).toBe('Cancel')
    expect(progress.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('header [data-action="cancel"]')).toBeNull()
    click('[data-action="cancel"]')
    expect(document.getElementById('app')!.dataset.screen).toBe('folders')
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it.each(['dead', 'alive'] as const)('provides a bottom exit with %s results and makes no changes', async status => {
    api.checkUrl.mockResolvedValue({ status })
    click('[data-action="scan"]'); await flush()
    const action = status === 'alive' ? 'finish' : 'folders'
    const cancel = document.querySelector(`footer [data-action="${action}"]`)!
    expect(cancel.textContent).toBe(status === 'alive' ? 'Finish' : 'Cancel')
    click(`footer [data-action="${action}"]`); await flush()
    expect(document.getElementById('app')!.dataset.screen).toBe('folders')
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it.each(['move', 'delete'] as const)('allows %s for uncertain and redirected links even with no dead results', async mode => {
    api.checkUrl.mockImplementation(async (url: string) => ({
      status: url === 'https://1.example' ? 'unreachable' : url === 'https://2.example' ? 'moved' : 'alive',
    }))
    click('[data-action="scan"]'); await flush()
    expect(document.querySelector('[data-action="review"]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="review"]')!.disabled).toBe(true)
    click('[data-action="section"][data-status="unreachable"]')
    expect(document.querySelectorAll('[data-bookmark]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    click('[data-bookmark="1"]')
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="1"]')!.checked).toBe(true)
    click('[data-action="section"][data-status="moved"]')
    expect(document.querySelector('[data-bookmark="1"]')).toBeNull()
    expect(document.querySelectorAll('[data-bookmark]')).toHaveLength(1)
    click('[data-action="none"]')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    click('[data-action="all"]')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(1)
    expect(document.querySelector('[data-action="review"]')!.textContent).toBe('Remove 2 bookmarks')
    if (mode === 'delete') click('#delete-mode')
    click('[data-action="review"]')
    expect(document.querySelector('dialog')!.textContent).not.toContain('not confirmed dead')
    expect(api.sendMessage).not.toHaveBeenCalled()
    api.sendMessage.mockResolvedValue({ outcome: { succeeded: ['1', '2'], failed: [] } })
    click('[data-action="confirm"]'); await flush()
    expect(document.getElementById('app')!.dataset.screen).toBe('complete')
    expect(document.body.textContent).toContain('Nice work!')
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ mode, bookmarks: [
      expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' }),
    ] }))
    expect(document.querySelector('[data-action="review"]')).toBeNull()
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.body.textContent).toContain(mode === 'move' ? '2 bookmarks moved to Deleted Bookmarks' : '2 bookmarks permanently deleted')
    const shares = [...document.querySelectorAll<HTMLAnchorElement>('.share-links a')]
    expect(shares).toHaveLength(2)
    for (const link of shares) {
      expect(decodeURIComponent(link.href)).toContain('https://apps.nan.do/cleanmarks')
      expect(decodeURIComponent(link.href)).not.toContain('https://1.example')
    }
    expect(document.querySelector<HTMLAnchorElement>('.coffee-link')!.href).toBe('https://buymeacoffee.com/nandorossi')
    expect(document.querySelector('.support')!.textContent).toContain('nando rossi')
    click('[data-action="finish"]'); await flush()
    expect(document.getElementById('app')!.dataset.screen).toBe('folders')
  })

  it('opens only one category at a time and retains selection in collapsed categories', async () => {
    api.checkUrl.mockImplementation(async (url: string) => ({
      status: url === 'https://1.example' ? 'moved' : url === 'https://2.example' ? 'dead' : 'unreachable',
    }))
    click('[data-action="scan"]'); await flush()
    expect(document.querySelectorAll('.category-toggle[aria-expanded="true"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(1)
    click('[data-action="none"]')
    click('[data-bookmark="2"]')
    click('[data-action="section"][data-status="unreachable"]')
    expect(document.querySelectorAll('.category-toggle[aria-expanded="true"]')).toHaveLength(1)
    expect(document.querySelector('[data-bookmark="2"]')).toBeNull()
    click('[data-bookmark="3"]', true)
    expect(document.querySelector('[data-action="review"]')!.textContent).toBe('Remove 2 bookmarks')
    click('[data-action="section"][data-status="moved"]')
    expect(document.querySelectorAll('.category-toggle[aria-expanded="true"]')).toHaveLength(1)
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="1"]')!.checked).toBe(false)
    click('[data-action="all"]')
    expect(document.querySelector('[data-action="review"]')!.textContent).toBe('Remove 3 bookmarks')
    click('[data-action="section"][data-status="dead"]')
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="2"]')!.checked).toBe(true)
    click('[data-action="section"][data-status="dead"]')
    expect(document.querySelectorAll('.category-toggle[aria-expanded="true"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-bookmark]')).toHaveLength(0)
  })

  it('shows setup first, scans on a separate screen and preserves choices on back', async () => {
    const app = document.getElementById('app')!
    expect(app.dataset.screen).toBe('folders')
    expect(document.querySelector('#results')).toBeNull()
    expect(document.querySelector('#delete-mode')).toBeNull()
    click('[data-action="folders-none"]')
    click('[data-folder="folder"]')
    document.querySelector<HTMLElement>('.folder-tree')!.scrollTop = 140
    click('[data-action="scan"]')
    expect(app.dataset.screen).toBe('results')
    expect(document.querySelector('.folder-tree')).toBeNull()
    await flush()
    expect(document.querySelector('[data-action="review"]')).not.toBeNull()
    click('[data-action="folders"]')
    expect(app.dataset.screen).toBe('folders')
    expect(document.querySelector<HTMLInputElement>('[data-folder="folder"]')!.checked).toBe(true)
    expect(document.querySelector<HTMLElement>('.folder-tree')!.scrollTop).toBe(140)
    expect(document.querySelector('#results')).toBeNull()
  })

  it('keeps nested folder controls mounted and focused while updating selection', async () => {
    api.getTree.mockResolvedValue([{ id: 'root', title: '', children: [{
      id: 'folder', title: 'Work', parentId: 'root', children: [
        ...tree()[0]!.children![0]!.children!,
        { id: 'nested', title: 'Nested', parentId: 'folder', children: [
          { id: '4', title: 'Nested link', url: 'https://nested.example', parentId: 'nested', index: 0 },
        ] },
      ],
    }] }])
    click('[data-action="scan"]'); await flush()
    click('[data-action="folders"]')
    click('[data-action="expand"][data-id="folder"]')
    const list = document.querySelector<HTMLElement>('.folder-tree')!
    const nested = document.querySelector<HTMLInputElement>('[data-folder="nested"]')!
    const parent = document.querySelector<HTMLInputElement>('[data-folder="folder"]')!
    nested.focus()
    list.scrollTop = 200
    nested.click()
    expect(document.querySelector('.folder-tree')).toBe(list)
    expect(document.querySelector('[data-folder="nested"]')).toBe(nested)
    expect(document.activeElement).toBe(nested)
    expect(list.scrollTop).toBe(200)
    expect(nested.checked).toBe(false)
    expect(parent.indeterminate).toBe(true)
    click('[data-action="folders-none"]')
    expect(document.querySelector('.folder-tree')).toBe(list)
    expect(parent.indeterminate).toBe(false)
    expect(parent.checked).toBe(false)
    nested.click()
    expect(parent.indeterminate).toBe(true)
    api.checkUrl.mockClear()
    click('[data-action="scan"]'); await flush()
    expect(api.checkUrl).toHaveBeenCalledTimes(1)
    expect(api.checkUrl.mock.calls[0]![0]).toBe('https://nested.example')
  })

  it('defaults to all links selected, supports shift range and confirms moves', async () => {
    click('[data-action="scan"]'); await flush()
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(3)
    click('[data-bookmark="1"]')
    click('[data-bookmark="3"]', true)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    click('[data-action="all"]')
    click('[data-action="review"]')
    expect(api.sendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('dialog')!.textContent).toContain('Move to Deleted Bookmarks')
    api.sendMessage.mockResolvedValue({ outcome: { succeeded: ['1'], failed: [{ id: '2', error: 'Denied' }, { id: '3', error: 'Denied' }] } })
    click('[data-action="confirm"]'); await flush()
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'move', bookmarks: expect.any(Array) }))
    expect(document.getElementById('app')!.dataset.screen).toBe('complete')
    expect(document.body.textContent).toContain('A little more to do')
    expect(document.body.textContent).toContain('1 bookmark moved to Deleted Bookmarks')
    expect(document.body.textContent).toContain('2 selected bookmarks still need attention')
    click('[data-action="review_remaining"]')
    expect(document.querySelector('[data-bookmark="1"]')).toBeNull()
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(2)
    expect(document.body.textContent).toContain('2 failed')
  })

  it('includes folders created after opening the panel in the default scan', async () => {
    const updated = tree()
    updated[0]!.children!.push({ id: 'new', title: 'New', parentId: 'root', children: [{ id: '4', parentId: 'new', index: 0, title: 'New link', url: 'https://4.example' }] })
    api.getTree.mockResolvedValue(updated)
    click('[data-action="scan"]'); await flush()
    expect(api.checkUrl).toHaveBeenCalledTimes(4)
  })

  it('prevents late results after cancel and aborts in-flight checks', async () => {
    let signal: AbortSignal | undefined
    let finish: ((value: { status: string; statusCode: number }) => void) | undefined
    api.checkUrl.mockImplementation((_url, _timeout, abortSignal) => {
      signal = abortSignal
      return new Promise(resolve => { finish = resolve })
    })
    click('[data-action="scan"]'); await flush()
    click('[data-action="cancel"]')
    expect(signal!.aborted).toBe(true)
    finish!({ status: 'dead', statusCode: 404 }); await flush()
    expect(document.querySelector('[data-bookmark]')).toBeNull()
    expect(document.body.textContent).not.toContain('likely dead')
  })

  it('does not start checks after cancelling asynchronous scan preparation', async () => {
    let resolveTree: ((value: ReturnType<typeof tree>) => void) | undefined
    api.getTree.mockImplementation(() => new Promise(resolve => { resolveTree = resolve }))
    click('[data-action="scan"]')
    click('[data-action="cancel"]')
    resolveTree!(tree()); await flush()
    expect(api.checkUrl).not.toHaveBeenCalled()
    expect(document.querySelector('[data-bookmark]')).toBeNull()
  })
})
