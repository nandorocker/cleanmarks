import { playConfetti } from './confetti'

interface MotionChange {
  screen: boolean
  phase: boolean
  dialog: boolean
  celebrate: boolean
  direction?: 'forward' | 'back'
}

const accordionAnimations = new WeakMap<HTMLElement, { animation: Animation; finished: Promise<void> }>()

export function pendingAccordionTransition(pane: HTMLElement): Promise<void> | undefined {
  return accordionAnimations.get(pane)?.finished
}

export function animateAccordionPane(pane: HTMLElement, open: boolean, enabled = true, content?: string): Promise<void> {
  const height = pane.hidden ? 0 : pane.getBoundingClientRect().height
  accordionAnimations.get(pane)?.animation.cancel()
  accordionAnimations.delete(pane)
  if (open && content !== undefined) pane.innerHTML = content
  pane.toggleAttribute('inert', !open)
  pane.setAttribute('aria-hidden', String(!open))
  const finish = () => {
    pane.hidden = !open
    pane.style.height = ''
    pane.style.overflow = ''
    if (!open) pane.replaceChildren()
  }
  if (!enabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !pane.animate) {
    finish()
    return Promise.resolve()
  }
  pane.style.overflow = 'hidden'
  // Establish the collapsed (or interrupted) height before revealing content.
  // Otherwise a newly unhidden pane can paint at its natural height before
  // the browser applies the animation's first frame.
  pane.style.height = `${height}px`
  pane.hidden = false
  const targetHeight = open ? pane.scrollHeight : 0
  pane.getBoundingClientRect() // Commit the initial height before starting WAAPI.
  // Height is intentional here: adjacent accordion headings must move with the
  // pane. Measure at the start, then let the browser run this short layout change.
  const animation = pane.animate([
    { height: `${height}px` }, { height: `${targetHeight}px` },
  ], { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' })
  const finished = animation.finished.then(() => {
    if (accordionAnimations.get(pane)?.animation !== animation) return
    accordionAnimations.delete(pane)
    finish()
    animation.cancel() // Release the filled pixel height so open content can grow.
  }).catch(() => {})
  accordionAnimations.set(pane, { animation, finished })
  return finished
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
