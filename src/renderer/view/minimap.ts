/**
 * view/minimap.ts — 右下角缩略图 + 视口框（README Roadmap M4）
 *
 * 输入是**结构类型**（不 import 队友的 LaidOutNode 类型名）：
 *   nodes: Map<string, {x,y,width,height,kind,state}> 或 MinimapNode[]
 *   viewportRect: 当前视口在世界坐标里的矩形
 *   bounds: 全图包围盒
 *
 * 上色只用 CSS 变量（ui.css 里映射到 tokens.css 的状态令牌），四种状态：
 * lit / available / locked / learning。
 *
 * 交互：
 *  - 拖拽视口框 → onPanTo(worldX, worldY)（发送视口**中心**的世界坐标）
 *  - 点击缩略图任意处 → onPanTo 同样坐标
 *  - 滚轮落在缩略图上 → onZoom(delta)，delta>0 放大
 *  - update(nodes, viewportRect, bounds) 幂等重绘（lead 每帧/每次状态变化都可调用）
 */
import type { NodeState } from '../core/graph'

export const MINIMAP_IDS = {
  root: 'minimap',
  viewport: 'minimap-viewport'
} as const

export type MinimapKind = 'branch' | 'unit' | 'leaf'

/** 结构类型输入：lead 可以传任何满足这个形状的东西 */
export interface MinimapNodeInput {
  x: number
  y: number
  width: number
  height: number
  kind: MinimapKind
  state: NodeState
}

export interface MinimapNode extends MinimapNodeInput {
  id: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface MinimapDeps {
  /** 拖拽/点击后的目标视口中心（世界坐标） */
  onPanTo: (worldX: number, worldY: number) => void
  /** 滚轮缩放：delta > 0 放大，< 0 缩小 */
  onZoom: (delta: number) => void
  /** 缩略图尺寸，默认 190×130 */
  size?: { width: number; height: number }
  /** 是否显示节点 id 提示（title 元素），默认 true */
  titles?: boolean
}

export interface MinimapHandle {
  readonly root: HTMLElement
  /** 幂等重绘；nodes 支持 Map 或数组 */
  update(nodes: Map<string, MinimapNodeInput> | readonly MinimapNode[], viewport: Rect, bounds: Rect): void
  clear(): void
  destroy(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const PAD = 6

function svgEl(name: string): SVGElement {
  return document.createElementNS(SVG_NS, name)
}

function collect(nodes: Map<string, MinimapNodeInput> | readonly MinimapNode[]): MinimapNode[] {
  if (nodes instanceof Map) {
    const out: MinimapNode[] = []
    for (const [id, v] of nodes) {
      out.push({ id, x: v.x, y: v.y, width: v.width, height: v.height, kind: v.kind, state: v.state })
    }
    return out
  }
  return nodes.slice()
}

/** 世界坐标 → 缩略图坐标的等比映射（含 PAD 内边距），bounds 退化时安全回 0 */
export function makeMapper(
  bounds: Rect,
  target: { width: number; height: number },
  pad = PAD
): { toMini: (x: number, y: number) => [number, number]; toWorld: (mx: number, my: number) => [number, number]; scale: number } {
  const w = Math.max(1, target.width - pad * 2)
  const h = Math.max(1, target.height - pad * 2)
  const bw = Math.max(1e-6, bounds.width)
  const bh = Math.max(1e-6, bounds.height)
  const scale = Math.min(w / bw, h / bh)
  const ox = pad + (w - bw * scale) / 2
  const oy = pad + (h - bh * scale) / 2
  return {
    scale,
    toMini: (x, y) => [ox + (x - bounds.x) * scale, oy + (y - bounds.y) * scale],
    toWorld: (mx, my) => [bounds.x + (mx - ox) / scale, bounds.y + (my - oy) / scale]
  }
}

export function createMinimap(mount: HTMLElement, deps: MinimapDeps): MinimapHandle {
  const size = deps.size ?? { width: 190, height: 130 }
  const showTitles = deps.titles !== false

  const root = document.createElement('div')
  root.id = MINIMAP_IDS.root
  root.className = 'ui-minimap'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', '缩略图：拖拽视口框或点击可平移视图，滚轮可缩放')

  const svg = svgEl('svg')
  svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`)
  svg.setAttribute('width', String(size.width))
  svg.setAttribute('height', String(size.height))
  svg.setAttribute('class', 'ui-minimap__svg')

  const nodesLayer = svgEl('g')
  nodesLayer.setAttribute('class', 'ui-minimap__nodes')
  const viewportRect = svgEl('rect')
  viewportRect.setAttribute('id', MINIMAP_IDS.viewport)
  viewportRect.setAttribute('class', 'ui-minimap__viewport')
  viewportRect.setAttribute('tabindex', '0')
  viewportRect.setAttribute('role', 'img')
  viewportRect.setAttribute('aria-label', '当前视口')
  svg.append(nodesLayer, viewportRect)
  root.appendChild(svg)
  mount.appendChild(root)

  let mapper = makeMapper({ x: 0, y: 0, width: 1, height: 1 }, size)
  let dragging = false
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []
  function on(el: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    el.addEventListener(type, fn, opts)
    listeners.push({ el, type, fn })
  }

  /** 鼠标事件 → 缩略图局部坐标（svg 的 viewBox 与像素尺寸一致，直接按 boundingRect 折算） */
  function localPoint(e: MouseEvent): { x: number; y: number } {
    const r = svg.getBoundingClientRect()
    const sx = r.width > 0 ? size.width / r.width : 1
    const sy = r.height > 0 ? size.height / r.height : 1
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
  }

  function emitPan(e: MouseEvent): void {
    const p = localPoint(e)
    const [wx, wy] = mapper.toWorld(p.x, p.y)
    deps.onPanTo(wx, wy)
  }

  on(svg, 'mousedown', (ev) => {
    ev.preventDefault()
    dragging = true
    emitPan(ev as MouseEvent)
  })
  on(window, 'mousemove', (ev) => {
    if (dragging) emitPan(ev as MouseEvent)
  })
  on(window, 'mouseup', () => {
    dragging = false
  })
  on(svg, 'click', (ev) => {
    emitPan(ev as MouseEvent)
  })
  on(svg, 'wheel', (ev) => {
    ev.preventDefault()
    const e = ev as WheelEvent
    deps.onZoom(e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0)
  })

  return {
    root,
    update(nodes, view, bounds) {
      mapper = makeMapper(bounds, size)
      const list = collect(nodes)
      const frag = document.createDocumentFragment()
      for (const n of list) {
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
        const [x, y] = mapper.toMini(n.x, n.y)
        const [x2, y2] = mapper.toMini(n.x + n.width, n.y + n.height)
        const r = svgEl('rect')
        r.setAttribute('class', `ui-minimap__node ui-minimap__node--${n.state} ui-minimap__node--${n.kind}`)
        r.setAttribute('data-id', n.id)
        r.setAttribute('x', x.toFixed(2))
        r.setAttribute('y', y.toFixed(2))
        r.setAttribute('width', Math.max(1, x2 - x).toFixed(2))
        r.setAttribute('height', Math.max(1, y2 - y).toFixed(2))
        if (showTitles) {
          const t = svgEl('title')
          t.textContent = n.id
          r.appendChild(t)
        }
        frag.appendChild(r)
      }
      nodesLayer.replaceChildren(frag)

      const [vx, vy] = mapper.toMini(view.x, view.y)
      const [vx2, vy2] = mapper.toMini(view.x + view.width, view.y + view.height)
      viewportRect.setAttribute('x', vx.toFixed(2))
      viewportRect.setAttribute('y', vy.toFixed(2))
      viewportRect.setAttribute('width', Math.max(2, vx2 - vx).toFixed(2))
      viewportRect.setAttribute('height', Math.max(2, vy2 - vy).toFixed(2))
    },
    clear() {
      nodesLayer.replaceChildren()
      viewportRect.setAttribute('width', '0')
      viewportRect.setAttribute('height', '0')
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      dragging = false
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
