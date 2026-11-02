import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CODEX_CONFETTI, playConfetti } from '../../src/sidebar/confetti'
let frame: FrameRequestCallback
let root: HTMLElement
let context: CanvasRenderingContext2D
let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
beforeEach(() => {
  document.body.innerHTML = '<main></main>'
  root = document.querySelector('main')!
  preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn(() => preference))
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(performance, 'now').mockReturnValue(0)
  context = Object.fromEntries(['setTransform', 'clearRect', 'save', 'translate', 'rotate', 'scale', 'beginPath', 'roundRect', 'fill', 'restore'].map(name => [name, vi.fn()])) as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('CodexBar confetti browser port', () => {
  it('preserves the counter-rotating six-phase fireworks preset', () => {
    expect(CODEX_CONFETTI.clockwise).toEqual([270, 234, 198, 162, 126, 90])
    expect(CODEX_CONFETTI.counterclockwise).toEqual([90, 126, 162, 198, 234, 270])
    expect(CODEX_CONFETTI).toMatchObject({ phaseDelay: .06, lifetime: 8.5, tracers: 4, fragments: 42 })
  })
  it('plays once, renders tracers and explosions, then removes the overlay', () => {
    playConfetti(root)
    playConfetti(root)
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(root.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true')
    for (let time = 0; time <= 1200; time += 50) frame(time)
    expect(context.fill).toHaveBeenCalled()
    expect(context.scale).toHaveBeenCalled() // Tumbling fragments, not just tracers.
    frame(8500)
    expect(root.querySelector('canvas')).toBeNull()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(preference.removeEventListener).toHaveBeenCalled()
  })
  it('stops when the user leaves the screen', () => {
    playConfetti(root)
    root.innerHTML = ''
    const calls = vi.mocked(requestAnimationFrame).mock.calls.length
    frame(100)
    expect(vi.mocked(requestAnimationFrame).mock.calls).toHaveLength(calls)
    expect(preference.removeEventListener).toHaveBeenCalled()
  })
  it('skips reduced motion and stops if that preference changes during playback', () => {
    preference.matches = true
    playConfetti(root)
    expect(root.querySelector('canvas')).toBeNull()
    preference.matches = false
    playConfetti(root)
    preference.matches = true
    preference.addEventListener.mock.calls[0]![1]()
    expect(root.querySelector('canvas')).toBeNull()
  })
})
