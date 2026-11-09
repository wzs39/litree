/**
 * 点亮动效层（spec §9.3 五拍编排）：Canvas 粒子 + XP 飘字。
 * 审查 P0：原先粒子用布局世界坐标当 canvas CSS 像素绘制，从未乘 viewport 的
 * translate/scale，导致粒子与节点屏幕位置对不上。现在由 viewport 通过 setTransform
 * 注入映射，tick 内做 world→screen；粒子沿贝塞尔边飞行（easeOutQuint + 法向抖动）。
 */
import type { BezierSegment } from './graphCanvas'

export interface EffectTarget {
  id: string
  x: number
  y: number
  /** 沿边飞行的控制点（缺省直线） */
  curve?: BezierSegment
}

export interface EffectLayer {
  /** 由 viewport 每次变化后调用：世界坐标 → 屏幕像素映射 */
  setTransform(tx: number, ty: number, scale: number): void
  /** 从源节点向目标节点播放粒子；reduced-motion 时自动跳过粒子 */
  playLightUp(fromX: number, fromY: number, targets: EffectTarget[]): void
  spawnXpFloat(x: number, y: number, text: string): void
  resize(): void
}

interface Particle {
  curve: BezierSegment
  t: number
  step: number
  size: number
  jitter: number
  phase: number
}

interface XpFloat {
  el: HTMLDivElement
  x: number
  y: number
  until: number
}

const MAX_PARTICLES = 200
const MAX_PER_BURST = 12
const LIFE_FRAMES = 26

function cubic(c: BezierSegment, t: number): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.p1.x + 3 * u * t * t * c.p2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.p1.y + 3 * u * t * t * c.p2.y + t * t * t * c.p3.y
  }
}

function cubicTangent(c: BezierSegment, t: number): { x: number; y: number } {
  const u = 1 - t
  return {
    x: 3 * u * u * (c.p1.x - c.p0.x) + 6 * u * t * (c.p2.x - c.p1.x) + 3 * t * t * (c.p3.x - c.p2.x),
    y: 3 * u * u * (c.p1.y - c.p0.y) + 6 * u * t * (c.p2.y - c.p1.y) + 3 * t * t * (c.p3.y - c.p2.y)
  }
}

/** 缺省直线：控制点取中点，保证 cubic 退化为直线 */
function straight(fromX: number, fromY: number, to: EffectTarget): BezierSegment {
  const mx = (fromX + to.x) / 2
  const my = (fromY + to.y) / 2
  return {
    p0: { x: fromX, y: fromY },
    p1: { x: mx, y: my },
    p2: { x: mx, y: my },
    p3: { x: to.x, y: to.y }
  }
}

export function createEffectLayer(stage: HTMLElement): EffectLayer {
  const canvas = document.createElement('canvas')
  canvas.className = 'effect-layer'
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const particles: Particle[] = []
  const floats: XpFloat[] = []
  let raf = 0
  let dpr = 1
  let tx = 0
  let ty = 0
  let scale = 1

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

  function ensureLoop(): void {
    if (raf === 0) raf = requestAnimationFrame(tick)
  }

  function tick(): void {
    if (ctx === null) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      p.t += p.step
      if (p.t >= 1) {
        particles.splice(i, 1)
        continue
      }
      const eased = 1 - Math.pow(1 - p.t, 5) // easeOutQuint
      const pos = cubic(p.curve, eased)
      const tan = cubicTangent(p.curve, eased)
      const len = Math.hypot(tan.x, tan.y) || 1
      const nx = -tan.y / len
      const ny = tan.x / len
      const jitter = Math.sin(p.phase + p.t * Math.PI * 6) * p.jitter
      const sx = (pos.x + nx * jitter) * scale + tx
      const sy = (pos.y + ny * jitter) * scale + ty
      const alpha = Math.pow(1 - p.t, 0.7)
      ctx.beginPath()
      ctx.fillStyle = `rgba(255, 215, 106, ${(0.9 * alpha).toFixed(3)})`
      ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]!
      f.el.style.left = `${f.x * scale + tx}px`
      f.el.style.top = `${f.y * scale + ty}px`
      if (performance.now() >= f.until) {
        f.el.remove()
        floats.splice(i, 1)
      }
    }
    if (particles.length > 0 || floats.length > 0) raf = requestAnimationFrame(tick)
    else raf = 0
  }

  return {
    setTransform(txx, tyy, sss) {
      tx = txx
      ty = tyy
      scale = sss
    },

    playLightUp(fromX, fromY, targets) {
      if (reducedMotion || ctx === null) return
      for (const t of targets) {
        const curve = t.curve ?? straight(fromX, fromY, t)
        const dist = Math.max(1, Math.hypot(curve.p3.x - curve.p0.x, curve.p3.y - curve.p0.y))
        const count = Math.min(MAX_PER_BURST, Math.max(6, Math.round(dist / 60)))
        for (let i = 0; i < count; i++) {
          if (particles.length >= MAX_PARTICLES) return
          particles.push({
            curve,
            t: 0,
            step: 1 / LIFE_FRAMES,
            size: 2.6 + Math.random() * 1.6,
            jitter: 2 + Math.random() * 3,
            phase: Math.random() * Math.PI * 2
          })
        }
      }
      ensureLoop()
    },

    spawnXpFloat(x, y, text) {
      const el = document.createElement('div')
      el.className = 'xp-float'
      el.textContent = text
      stage.appendChild(el)
      const until = performance.now() + 700
      floats.push({ el, x, y, until })
      window.setTimeout(() => {
        const i = floats.findIndex((f) => f.el === el)
        if (i >= 0) {
          floats.splice(i, 1)
          el.remove()
        }
      }, 700)
      ensureLoop()
    },

    resize
  }
}
