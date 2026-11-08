/** 点亮动效层（spec §9.3 五拍编排）：Canvas 粒子 + XP 飘字；只写 transform/opacity */
export interface EffectTarget {
  id: string
  x: number
  y: number
}

export interface EffectLayer {
  /** 从源节点向目标节点播放粒子；reduced-motion 时自动跳过粒子 */
  playLightUp(fromX: number, fromY: number, targets: EffectTarget[]): void
  spawnXpFloat(x: number, y: number, text: string): void
  resize(): void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

const MAX_PARTICLES = 200
const MAX_PER_BURST = 12

export function createEffectLayer(stage: HTMLElement): EffectLayer {
  const canvas = document.createElement('canvas')
  canvas.className = 'effect-layer'
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const particles: Particle[] = []
  let raf = 0
  let dpr = 1

  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  function resize(): void {
    dpr = window.devicePixelRatio || 1
    canvas.width = stage.clientWidth * dpr
    canvas.height = stage.clientHeight * dpr
    canvas.style.width = `${stage.clientWidth}px`
    canvas.style.height = `${stage.clientHeight}px`
  }
  resize()
  window.addEventListener('resize', resize)

  function tick(): void {
    if (ctx === null) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      p.x += p.vx
      p.y += p.vy
      p.life--
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      const alpha = p.life / p.maxLife
      ctx.beginPath()
      ctx.fillStyle = `rgba(255, 215, 106, ${(0.9 * alpha).toFixed(3)})`
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    if (particles.length > 0) raf = requestAnimationFrame(tick)
    else raf = 0
  }

  function ensureLoop(): void {
    if (raf === 0) raf = requestAnimationFrame(tick)
  }

  return {
    playLightUp(fromX, fromY, targets) {
      if (reducedMotion || ctx === null) return
      for (const t of targets) {
        const dx = t.x - fromX
        const dy = t.y - fromY
        const dist = Math.max(1, Math.hypot(dx, dy))
        const count = Math.min(MAX_PER_BURST, Math.max(6, Math.round(dist / 60)))
        for (let i = 0; i < count; i++) {
          if (particles.length >= MAX_PARTICLES) return
          const spread = (Math.random() - 0.5) * 14
          const speed = dist / 26
          particles.push({
            x: fromX + (Math.random() - 0.5) * 10,
            y: fromY + (Math.random() - 0.5) * 10,
            vx: (dx / dist) * speed + (spread / dist) * speed * 0.3,
            vy: (dy / dist) * speed + (spread / dist) * speed * 0.3,
            life: 26,
            maxLife: 26,
            size: 2.6 + Math.random() * 1.6
          })
        }
      }
      ensureLoop()
    },

    spawnXpFloat(x, y, text) {
      const el = document.createElement('div')
      el.className = 'xp-float'
      el.textContent = text
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      stage.appendChild(el)
      window.setTimeout(() => el.remove(), 700)
    },

    resize
  }
}
