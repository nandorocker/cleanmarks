// Browser port of CodexBar's Swift/Vortex firework-confetti preset (MIT).
// Source and full copyright notice: licenses/CodexBar-MIT.txt.
// Retains the paired rotating phases, tracer lifetimes, 42-piece explosions,
// gravity/damping, shapes, and 8.5s overlay lifetime. Rendering is local Canvas2D.
export const CODEX_CONFETTI = {
  clockwise: [270, 234, 198, 162, 126, 90],
  counterclockwise: [90, 126, 162, 198, 234, 270],
  phaseDelay: .06, lifetime: 8.5, tracers: 4, fragments: 42,
} as const

interface Particle {
  x: number; y: number; vx: number; vy: number
  age: number; life: number; size: number; rotation: number; spin: number
  color: string; shape: number; phase?: number
}

export function playConfetti(root: HTMLElement): void {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (media?.matches || root.querySelector('.confetti')) return
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context || !window.requestAnimationFrame) return
  canvas.className = 'confetti'
  canvas.setAttribute('aria-hidden', 'true')
  root.append(canvas)
  const colors = ['#9fa0ff', '#d5e8e6', '#fff3e3', '#ff7171']
  let width = 1, height = 1, frame = 0
  const resize = () => {
    width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  resize()
  const stop = () => {
    cancelAnimationFrame(frame)
    canvas.remove()
    media?.removeEventListener?.('change', reduceMotion)
    window.removeEventListener('resize', resize)
    window.removeEventListener('pagehide', stop)
  }
  const reduceMotion = () => { if (media?.matches) stop() }
  media?.addEventListener?.('change', reduceMotion)
  window.addEventListener('resize', resize)
  window.addEventListener('pagehide', stop, { once: true })
  const launches = [CODEX_CONFETTI.clockwise, CODEX_CONFETTI.counterclockwise].flatMap((angles, bank) =>
    angles.flatMap((angle, phase) => Array.from({ length: CODEX_CONFETTI.tracers }, (_, rocket) => ({
      at: phase * CODEX_CONFETTI.phaseDelay + rocket / 18, angle, phase, lateral: bank ? 12 : -12,
    }))))
    .sort((a, b) => a.at - b.at)
  let nextLaunch = 0
  const particles: Particle[] = []
  const random = (low: number, high: number) => low + Math.random() * (high - low)
  const radians = (degrees: number) => degrees * Math.PI / 180
  function launch(angle: number, phase: number, lateral: number): void {
    const direction = radians(angle + random(-6, 6))
    const speed = 1.36 + phase * .04 + random(-.06, .06)
    particles.push({ x: Math.min(1, Math.max(0, (width - 28 + lateral) / width)), y: 8 / height,
      vx: Math.sin(direction) * speed, vy: -Math.cos(direction) * speed,
      age: 0, life: .58 + phase * .03, phase, color: '#fff', shape: 3,
      size: random(.30, .38), rotation: 0, spin: random(2, 10) })
  }
  function explode(tracer: Particle): void {
    for (let i = 0; i < CODEX_CONFETTI.fragments; i++) {
      const angle = random(0, Math.PI * 2), speed = random(.50, .94)
      particles.push({ x: tracer.x, y: tracer.y, vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed,
        age: -random(0, .08), life: 8, size: random(.61, .87),
        rotation: random(0, Math.PI * 2), spin: random(-4, 10),
        color: colors[Math.floor(Math.random() * colors.length)]!, shape: Math.floor(Math.random() * 3) })
    }
  }
  function draw(p: Particle): void {
    if (p.age < 0 || p.x < -.1 || p.x > 1.1 || p.y < -.1 || p.y > 1.1) return
    const tracer = p.phase !== undefined
    const remaining = Math.max(0, 1 - p.age / p.life)
    const size = p.size * (tracer ? .4 + .6 * remaining : .94 + .06 * remaining)
    const w = (p.shape === 0 ? 10 : p.shape === 1 ? 9 : p.shape === 2 ? 8 : 6) * size
    const h = (p.shape === 0 ? 20 : p.shape === 2 ? 16 : p.shape === 1 ? 9 : 6) * size
    context!.save()
    context!.translate(p.x * width, p.y * height)
    context!.rotate(p.rotation + (p.shape === 2 ? Math.PI / 6 : 0))
    if (!tracer) context!.scale(.82 * Math.cos(p.age * 3 + p.rotation), 1)
    context!.globalAlpha = Math.min(1, remaining * 5)
    context!.fillStyle = p.color
    context!.beginPath()
    context!.roundRect(-w / 2, -h / 2, w, h, p.shape === 0 ? 2 : Math.min(w, h) / 2)
    context!.fill()
    context!.restore()
  }
  const started = performance.now()
  let previous = started
  const tick = (now: number) => {
    if (media?.matches || !canvas.isConnected || (now - started) / 1000 >= CODEX_CONFETTI.lifetime) { stop(); return }
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000))
    previous = now
    const elapsed = (now - started) / 1000
    while (nextLaunch < launches.length && launches[nextLaunch]!.at <= elapsed) {
      const shot = launches[nextLaunch++]!
      launch(shot.angle, shot.phase, shot.lateral)
    }
    context.clearRect(0, 0, width, height)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      const tracer = p.phase !== undefined
      p.age += dt
      if (p.age < 0) continue
      if (p.age >= p.life || (p.y > 1.05 && p.vy > 0)) {
        particles.splice(i, 1)
        if (tracer && p.age >= p.life) explode(p)
        continue
      }
      p.x += p.vx * dt; p.y += p.vy * dt
      const damping = (tracer ? .06 : .34) / p.life
      p.vx -= p.vx * damping * dt; p.vy -= p.vy * damping * dt
      p.vy += (tracer ? .12 : .32) * dt
      p.rotation += p.spin * dt
      draw(p)
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}
