import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { animateView } from '../../src/sidebar/motion'
import { playConfetti } from '../../src/sidebar/confetti'
import { renderApp } from '../../src/sidebar/ui'
import type { AppView } from '../../src/sidebar/ui'
import { createState } from '../../src/sidebar/state'
vi.mock('../../src/sidebar/confetti', () => ({ playConfetti: vi.fn() }))
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const animate = vi.fn()
let root: HTMLElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  document.body.innerHTML = '<main><header><div class="stage-header"></div></header><section><div class="success-icon"></div><div class="completion-content"><h1>Nice work!</h1></div><p class="completion-summary"></p></section><dialog></dialog></main>'
  root = document.querySelector('main')!
})
afterEach(() => {
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else delete (Element.prototype as Partial<Element>).animate
  vi.unstubAllGlobals()
})
describe('decorative motion', () => {
  it.each([['forward', '100%'], ['back', '-25%']] as const)('uses an iOS-style horizontal %s transition', (direction, offset) => {
    animateView(root, { screen: true, phase: false, dialog: false, celebrate: false, direction })
    expect(animate.mock.calls[0]![0]).toEqual([{ transform: `translateX(${offset})` }, { transform: 'translateX(0)' }])
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
  })
  it('crossfades same-screen updates and opens dialogs centrally, not from below', () => {
    animateView(root, { screen: false, phase: true, dialog: true, celebrate: false })
    expect(animate.mock.calls[0]![0]).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(animate.mock.calls[1]![0]).toEqual([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' }])
  })
  it('derives forward and return direction from the actual screen hierarchy', () => {
    const view: AppView = { screen: 'folders', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(), mode: 'move', busy: false, loading: false, notice: '', confirm: false }
    renderApp(root, createState(), view)
    animate.mockClear()
    view.screen = 'results'
    renderApp(root, { ...createState(), phase: 'scanning' }, view)
    expect(animate.mock.calls[0]![0][0].transform).toBe('translateX(100%)')
    animate.mockClear()
    view.screen = 'folders'
    renderApp(root, createState(), view)
    expect(animate.mock.calls[0]![0][0].transform).toBe('translateX(-25%)')
  })
  it('celebrates successful completion only on entry, never on partial failures or rerenders', () => {
    const view: AppView = { screen: 'complete', tree: [], folders: new Set(), expanded: new Set(), sections: new Set(), mode: 'move', busy: false, loading: false, notice: '', confirm: false,
      completion: { mode: 'move', bookmarks: [{ id: '1', title: 'Link', url: 'https://example.com' }], remaining: 0 } }
    renderApp(root, createState(), view)
    expect(playConfetti).toHaveBeenCalledTimes(1)
    renderApp(root, createState(), view)
    expect(playConfetti).toHaveBeenCalledTimes(1)
    root.dataset.screen = 'results'
    view.completion!.remaining = 1
    renderApp(root, createState(), view)
    expect(playConfetti).toHaveBeenCalledTimes(1)
  })
  it('animates screen changes, dialogs and the successful reveal', () => {
    animateView(root, { screen: true, phase: false, dialog: true, celebrate: true })
    expect(animate).toHaveBeenCalledTimes(5)
    expect(playConfetti).toHaveBeenCalledWith(root)
  })
  it('does not animate routine rerenders or celebrate partial outcomes', () => {
    animateView(root, { screen: false, phase: false, dialog: false, celebrate: false })
    expect(animate).not.toHaveBeenCalled()
    expect(playConfetti).not.toHaveBeenCalled()
    animateView(root, { screen: true, phase: false, dialog: false, celebrate: false })
    expect(playConfetti).not.toHaveBeenCalled()
  })
  it('respects reduced motion and keyboard activation', () => {
    const change = { screen: true, phase: true, dialog: true, celebrate: true }
    animateView(root, change, false)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    animateView(root, change)
    expect(animate).not.toHaveBeenCalled()
    expect(playConfetti).not.toHaveBeenCalled()
  })
})
