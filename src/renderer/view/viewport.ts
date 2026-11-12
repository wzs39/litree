/**
 * 视口控制器（动画僵硬根因修复）：
 * - rAF 指数补间（exponential smoothing），收敛后停 rAF，不常驻
 * - wheel 缩放锚定光标（光标下世界点不动），连续缩放系数 + ctrl/触控板归一化
 * - 拖拽平移带惯性（release 后速度衰减）
 * - 拖拽位移超过阈值时抑制随之而来的 click（否则拖完误开面板）
 */

export interface ViewportTransform {
  tx: number
  ty: number
  scale: number
}

export interface ViewportOptions {
  /** 每帧指数平滑系数（0.18 ≈ 5 帧收敛） */
  smoothing?: number
  /** 收敛阈值（各分量绝对值） */
  epsilon?: number
  /** 自由缩放下下限 */
  minScale?: number
  /** 自由缩放上限 */
  maxScale?: number
  /** fitView 专用缩放下限（审查 P0：57 个大单元缩到 4.5px 不可读） */
  fitMinScale?: number
  /** 拖拽位移阈值（px），超过则抑制后续 click */
  dragSuppressPx?: number
  /** 每次实际变换后回调（effects / minimap 用） */
  onChange?: (t: ViewportTransform) => void
}

const DEFAULTS: Required<ViewportOptions> = {
  smoothing: 0.18,
  epsilon: 0.15,
  minScale: 0.15,
  maxScale: 4,
  fitMinScale: 0.7,
  dragSuppressPx: 4,
  onChange: () => {}
}

export class ViewportController {
  private readonly svgEl: SVGSVGElement
  private readonly opts: Required<ViewportOptions>
  /** 当前已应用的变换（真实绘制值） */
  private cur: ViewportTransform = { tx: 0, ty: 0, scale: 1 }
  /** 目标变换（补间/拖拽/惯性都写这里） */
  private tgt: ViewportTransform = { tx: 0, ty: 0, scale: 1 }
  private rafId = 0

  private dragging = false
  private dragMoved = 0
  private lastX = 0
  private lastY = 0
  private velMsX = 0
  private velMsY = 0
  private lastMoveTime = 0

  private inertia = false
  private inertiaX = 0
  private inertiaY = 0

  private suppressClickUntil = 0

  private readonly boundTick = (): void => this.tick()
  private readonly boundWheel = (e: WheelEvent): void => this.onWheel(e)
  private readonly boundMouseDown = (e: MouseEvent): void => this.onMouseDown(e)
  private readonly boundMouseMove = (e: MouseEvent): void => this.onMouseMove(e)
  private readonly boundMouseUp = (): void => this.onMouseUp()
  private readonly boundClick = (e: MouseEvent): void => this.onClick(e)

  constructor(svgEl: SVGSVGElement, options: ViewportOptions = {}) {
    this.svgEl = svgEl
    this.opts = { ...DEFAULTS, ...options }
  }

  attach(): void {
    this.svgEl.addEventListener('wheel', this.boundWheel, { passive: false })
    this.svgEl.addEventListener('mousedown', this.boundMouseDown)
    window.addEventListener('mousemove', this.boundMouseMove)
    window.addEventListener('mouseup', this.boundMouseUp)
    // capture 阶段拦截：拖拽后的 click 不得冒泡到 app 层打开面板
    this.svgEl.addEventListener('click', this.boundClick, true)
  }

  detach(): void {
    this.svgEl.removeEventListener('wheel', this.boundWheel)
    this.svgEl.removeEventListener('mousedown', this.boundMouseDown)
    window.removeEventListener('mousemove', this.boundMouseMove)
    window.removeEventListener('mouseup', this.boundMouseUp)
    this.svgEl.removeEventListener('click', this.boundClick, true)
    this.stopLoop()
  }

  /** 立即把当前 cur 写到 .viewport 的 transform 属性 */
  apply(): void {
    const vp = this.svgEl.querySelector('.viewport')
    if (vp instanceof SVGGElement) {
      vp.setAttribute('transform', `translate(${this.cur.tx}, ${this.cur.ty}) scale(${this.cur.scale})`)
    }
    this.opts.onChange(this.cur)
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.cur.scale + this.cur.tx, y: wy * this.cur.scale + this.cur.ty }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.cur.tx) / this.cur.scale, y: (sy - this.cur.ty) / this.cur.scale }
  }

  getTransform(): ViewportTransform {
    return { ...this.cur }
  }

  getTarget(): ViewportTransform {
    return { ...this.tgt }
  }

  /** 设置目标变换（补间逼近）；immediate=true 时直接生效（供初始化/测试） */
  setTransform(tx: number, ty: number, scale: number, immediate = false): void {
    const s = Math.min(this.opts.maxScale, Math.max(this.opts.minScale, scale))
    this.tgt = { tx, ty, scale: s }
    if (immediate) {
      this.cur = { ...this.tgt }
      this.stopLoop()
      this.apply()
    } else {
      this.schedule()
    }
  }

  /** 补间到能完整容纳 .viewport 的变换；保留 scale ≥ fitMinScale 的决策 */
  fitView(stage: HTMLElement): void {
    const sw = stage.clientWidth
    const sh = stage.clientHeight
    const vp = this.svgEl.querySelector('.viewport')
    const bbox = vp instanceof SVGGElement ? vp.getBBox() : null
    if (bbox !== null && bbox.width > 0) {
      // 下限 fitMinScale（审查 P0：57 个大单元 fitView 缩到 4.5px 不可读），超出交给平移缩放
      const fit = Math.min(sw / (bbox.width + 80), sh / (bbox.height + 80))
      const s = Math.min(1.2, Math.max(this.opts.fitMinScale, fit))
      const tx = (sw - bbox.width * s) / 2 - bbox.x * s
      const ty = (sh - bbox.height * s) / 2 - bbox.y * s
      this.setTransform(tx, ty, s)
    } else {
      this.setTransform(sw / 2, 60, 1)
    }
  }

  /** 聚焦天体/行星世界坐标并平滑补间居中（offsetX 为面板避让偏移，默认偏左保证视野开阔） */
  focusOn(worldX: number, worldY: number, targetScale?: number, offsetX = 160): void {
    const sw = this.svgEl.clientWidth || window.innerWidth
    const sh = this.svgEl.clientHeight || window.innerHeight
    const s = targetScale !== undefined
      ? Math.min(this.opts.maxScale, Math.max(this.opts.minScale, targetScale))
      : Math.min(this.opts.maxScale, Math.max(1.05, this.cur.scale))
    // 计算屏幕视觉中心点（考虑右侧展开的 DetailPanel，中心点偏左 offsetX）
    const cx = Math.max(sw * 0.3, (sw - offsetX) / 2)
    const cy = sh / 2
    const tx = cx - worldX * s
    const ty = cy - worldY * s
    this.setTransform(tx, ty, s)
  }

  private schedule(): void {
    if (this.rafId === 0) this.rafId = requestAnimationFrame(this.boundTick)
  }

  private stopLoop(): void {
    if (this.rafId !== 0) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  private tick(): void {
    this.rafId = 0
    let active = false
    if (this.inertia) {
      this.tgt.tx += this.inertiaX
      this.tgt.ty += this.inertiaY
      const mag = Math.hypot(this.inertiaX, this.inertiaY)
      this.inertiaX *= 0.9
      this.inertiaY *= 0.9
      if (mag < 0.35) {
        this.inertia = false
        this.inertiaX = 0
        this.inertiaY = 0
      } else {
        active = true
      }
    }
    const e = this.opts.epsilon
    const k = this.opts.smoothing
    const dx = this.tgt.tx - this.cur.tx
    const dy = this.tgt.ty - this.cur.ty
    const ds = this.tgt.scale - this.cur.scale
    if (Math.abs(dx) > e || Math.abs(dy) > e || Math.abs(ds) > e) {
      this.cur.tx += dx * k
      this.cur.ty += dy * k
      this.cur.scale += ds * k
      active = true
    }
    this.apply()
    if (active) this.schedule()
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    // 归一化 delta：deltaMode 1=行(16px) 2=页(100px) 0=像素；ctrl/触控板提高精度
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
    const delta = (e.deltaY * unit) / 100
    const boost = e.ctrlKey ? 1.2 : 1
    const factor = Math.exp(-delta * 0.001 * boost)
    const rect = this.svgEl.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    // 光标下的世界点
    const wx = (mx - this.cur.tx) / this.cur.scale
    const wy = (my - this.cur.ty) / this.cur.scale
    const ns = Math.min(this.opts.maxScale, Math.max(this.opts.minScale, this.cur.scale * factor))
    // 锚点修正：让该世界点在新 scale 下仍位于光标处
    this.tgt = { tx: mx - wx * ns, ty: my - wy * ns, scale: ns }
    this.schedule()
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return // 右键不进入拖拽
    this.dragging = true
    this.dragMoved = 0
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.velMsX = 0
    this.velMsY = 0
    this.lastMoveTime = performance.now()
    this.inertia = false
    this.inertiaX = 0
    this.inertiaY = 0
    this.stopLoop()
    this.svgEl.classList.add('panning')
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.dragMoved += Math.hypot(dx, dy)
    const now = performance.now()
    const dt = Math.max(1, now - this.lastMoveTime)
    this.lastMoveTime = now
    this.velMsX = this.velMsX * 0.6 + (dx / dt) * 0.4
    this.velMsY = this.velMsY * 0.6 + (dy / dt) * 0.4
    // 拖拽时 1:1 跟手（不补间）
    this.tgt.tx += dx
    this.tgt.ty += dy
    this.cur.tx = this.tgt.tx
    this.cur.ty = this.tgt.ty
    this.apply()
  }

  private onMouseUp(): void {
    if (!this.dragging) return
    this.dragging = false
    this.svgEl.classList.remove('panning')
    if (this.dragMoved > this.opts.dragSuppressPx) {
      this.suppressClickUntil = performance.now() + 220
    }
    const mvx = this.velMsX * 16.7
    const mvy = this.velMsY * 16.7
    if (Math.hypot(mvx, mvy) > 0.4) {
      this.inertia = true
      this.inertiaX = mvx
      this.inertiaY = mvy
      this.schedule()
    } else {
      this.stopLoop()
    }
  }

  private onClick(e: MouseEvent): void {
    if (performance.now() < this.suppressClickUntil) {
      e.stopPropagation()
      e.preventDefault()
    }
  }
}
