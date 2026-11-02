import { playConfetti } from './confetti'

interface MotionChange {
  screen: boolean
  phase: boolean
  dialog: boolean
  celebrate: boolean
  direction?: 'forward' | 'back'
}

// Decorative only: controls and focus never wait for an animation to finish.
export function animateView(root: HTMLElement, change: MotionChange, enabled = true): void {
  if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const animate = (element: Element | null, frames: Keyframe[], duration: number, delay = 0, easing = 'cubic-bezier(0.23, 1, 0.32, 1)') => {
    element?.animate?.(frames, { duration, delay, easing, fill: 'backwards' })
  }
  if (change.screen && change.direction) {
    const from = change.direction === 'forward' ? '100%' : '-25%'
    const titleFrom = change.direction === 'forward' ? '18px' : '-18px'
    animate(root.querySelector(':scope > section'), [
      { transform: `translateX(${from})` }, { transform: 'translateX(0)' },
    ], 300, 0, 'cubic-bezier(0.32, 0.72, 0, 1)')
    animate(root.querySelector('.stage-header'), [
      { opacity: 0, transform: `translateX(${titleFrom})` }, { opacity: 1, transform: 'translateX(0)' },
    ], 240)
  } else if (change.screen || change.phase) {
    // A scan finishing is a state update, not navigation to another page.
    animate(root.querySelector(':scope > section'), [
      { opacity: 0 }, { opacity: 1 },
    ], 160)
  }
  if (change.dialog) {
    animate(root.querySelector('dialog'), [
      { opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' },
    ], 180)
  }
  if (!change.celebrate) return
  animate(root.querySelector('.success-icon'), [
    { opacity: 0, transform: 'scale(.7) rotate(-12deg)' },
    { opacity: 1, transform: 'scale(1.08) rotate(4deg)', offset: .65 },
    { opacity: 1, transform: 'scale(1) rotate(0deg)' },
  ], 480)
  animate(root.querySelector('.completion-content h1'), [
    { opacity: 0 }, { opacity: 1 },
  ], 280, 100)
  animate(root.querySelector('.completion-summary'), [
    { opacity: 0 }, { opacity: 1 },
  ], 280, 160)
  playConfetti(root)
}
