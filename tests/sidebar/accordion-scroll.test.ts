import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, updateAccordion } from '../../src/sidebar/ui'
import type { AppView } from '../../src/sidebar/ui'
import { createState } from '../../src/sidebar/state'
import { animateAccordionPane, pendingAccordionTransition } from '../../src/sidebar/motion'

vi.mock('../../src/sidebar/motion', () => ({ animateView: vi.fn(), animateAccordionPane: vi.fn(), pendingAccordionTransition: vi.fn() }))
let root: HTMLElement, scroller: HTMLElement, view: AppView
const state = { ...createState(), phase: 'done' as const, results: (['dead', 'unreachable', 'moved'] as const).map(status => ({
  status, bookmark: { id: status, title: status, url: 'https://example.com' },
})) }
let completions: (() => void)[]
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve() }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(pendingAccordionTransition).mockReset()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  completions = []
  vi.mocked(animateAccordionPane).mockImplementation(() => new Promise<void>(resolve => completions.push(resolve)))
  document.body.innerHTML = '<main id="app"></main>'
  root = document.getElementById('app')!
  view = { screen: 'results', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(['dead']), mode: 'move', busy: false, loading: false, notice: '', confirm: false, motionEnabled: true }
  renderApp(root, state, view)
  scroller = root.querySelector<HTMLElement>('#results')!
  scroller.scrollTo = vi.fn()
  scroller.scrollTop = 40
  Object.defineProperty(scroller, 'clientHeight', { value: 300 })
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
  scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
  for (const heading of root.querySelectorAll('h2')) heading.getBoundingClientRect = () => ({ top: 260 }) as DOMRect
})
afterEach(() => vi.unstubAllGlobals())

describe('accordion heading alignment', () => {
  it('also waits for an earlier collapse when switching from pointer to instant keyboard navigation', async () => {
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    const finishOld = completions.splice(0)
    const oldCollapse = new Promise<void>(resolve => {
      const original = finishOld[0]!
      finishOld[0] = () => { original(); resolve() }
    })
    vi.mocked(pendingAccordionTransition).mockImplementation(pane => pane.id === 'section-dead' ? oldCollapse : undefined)
    view.motionEnabled = false
    view.sections = new Set(['unreachable'])
    vi.mocked(animateAccordionPane).mockResolvedValue(undefined)
    updateAccordion(root, state, view)
    finishOld[1]!(); await flush()
    expect(scroller.scrollTo).not.toHaveBeenCalled()
    finishOld[0]!(); await flush()
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'instant' })
  })
  it('waits for both panes before aligning the selected title within the results scroller', async () => {
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    expect(completions).toHaveLength(2)
    expect(scroller.scrollTo).not.toHaveBeenCalled()
    completions[0]!(); await flush()
    expect(scroller.scrollTo).not.toHaveBeenCalled()
    completions[1]!(); await flush()
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'smooth' })
  })
  it('clamps the target when there is not enough content below the heading', async () => {
    Object.defineProperty(scroller, 'scrollHeight', { value: 350 })
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    completions.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 50, behavior: 'smooth' })
  })
  it('does not move a results list that cannot scroll', async () => {
    Object.defineProperty(scroller, 'scrollHeight', { value: 300 })
    scroller.scrollTop = 0
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    completions.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })
  it.each(['keyboard', 'reduced motion'])('aligns instantly for %s', async preference => {
    if (preference === 'keyboard') view.motionEnabled = false
    else vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    completions.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'instant' })
  })
  it('ignores an old expansion when another category was selected in the meantime', async () => {
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    const old = completions.splice(0)
    view.sections = new Set(['unreachable'])
    updateAccordion(root, state, view)
    old.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).not.toHaveBeenCalled()
    completions.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).toHaveBeenCalledOnce()
  })
  it('ignores alignment after leaving or rerendering the results screen', async () => {
    view.sections = new Set(['moved'])
    updateAccordion(root, state, view)
    root.innerHTML = ''
    completions.forEach(resolve => resolve()); await flush()
    expect(scroller.scrollTo).not.toHaveBeenCalled()
  })
})
