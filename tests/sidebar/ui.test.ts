import { describe, expect, it } from 'vitest'
import { renderApp } from '../../src/sidebar/ui'
import type { AppView } from '../../src/sidebar/ui'
import { createState, applyMessage, selectRange } from '../../src/sidebar/state'

describe('review UI', () => {
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
    expect(root.querySelector('.folder-tree')).toBeNull()
    view.screen = 'folders'
    renderApp(root, state, view)
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
