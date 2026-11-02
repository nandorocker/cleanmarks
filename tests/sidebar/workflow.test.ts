import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ getTree: vi.fn(), get: vi.fn(), sendMessage: vi.fn(), checkUrl: vi.fn() }))
vi.mock('webextension-polyfill', () => ({ default: {
  bookmarks: { getTree: api.getTree }, storage: { local: { get: api.get } },
  runtime: { sendMessage: api.sendMessage },
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
  it.each(['move', 'delete'] as const)('allows %s for uncertain and redirected links even with no dead results', async mode => {
    api.checkUrl.mockImplementation(async (url: string) => ({
      status: url === 'https://1.example' ? 'unreachable' : url === 'https://2.example' ? 'moved' : 'alive',
    }))
    click('[data-action="scan"]'); await flush()
    expect(document.querySelector('[data-action="review"]')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('[data-action="review"]')!.disabled).toBe(true)
    click('[data-action="section"][data-status="unreachable"]')
    click('[data-action="section"][data-status="moved"]')
    expect(document.querySelectorAll('[data-bookmark]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    click('[data-bookmark="1"]')
    expect(document.querySelector<HTMLInputElement>('[data-bookmark="1"]')!.checked).toBe(true)
    click('[data-action="none"]')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(0)
    click('[data-action="all"]')
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(2)
    if (mode === 'delete') click('#delete-mode')
    click('[data-action="review"]')
    expect(document.querySelector('dialog')!.textContent).toContain('1 couldn’t verify and 1 redirected')
    expect(document.querySelector('dialog')!.textContent).toContain('not confirmed dead')
    expect(api.sendMessage).not.toHaveBeenCalled()
    api.sendMessage.mockResolvedValue({ outcome: { succeeded: ['1', '2'], failed: [] } })
    click('[data-action="confirm"]'); await flush()
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ mode, bookmarks: [
      expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' }),
    ] }))
    expect(document.querySelector('[data-action="review"]')).toBeNull()
  })

  it('shift-selects across categories in visible order, not completion order', async () => {
    api.checkUrl.mockImplementation(async (url: string) => ({
      status: url === 'https://1.example' ? 'moved' : url === 'https://2.example' ? 'dead' : 'unreachable',
    }))
    click('[data-action="scan"]'); await flush()
    click('[data-action="section"][data-status="unreachable"]')
    click('[data-action="section"][data-status="moved"]')
    expect([...document.querySelectorAll<HTMLInputElement>('[data-bookmark]')].map(input => input.dataset.bookmark)).toEqual(['2', '3', '1'])
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(1)
    click('[data-action="none"]')
    click('[data-bookmark="2"]')
    click('[data-bookmark="1"]', true)
    expect(document.querySelectorAll('[data-bookmark]:checked')).toHaveLength(3)
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
