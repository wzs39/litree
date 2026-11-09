/**
 * SVG 图谱渲染（spec §5.3/§5.4）：keyed 增量 DOM 同步。
 * 审查 P0：原先 `svgEl.innerHTML = parts.join('')` 每次状态变化都全量销毁重建，
 * 导致节点位置跳变、CSS 动画（bloom/unlock-pop/breathe）被下一帧重置打断（动画僵硬根因）。
 * 现在按 data-id 复用已有元素，只更新 class/transform/文本/属性；新增 insert、消失 remove。
 */
import type { GraphIndex, NodeState } from '../core/graph'
import type { Pack, PackNode } from '../core/types'
import { NODE_SIZE, ROOT_VIEW, type LaidOutNode } from '../layout/elk'
import { esc } from './escape'
import { icon } from './icons'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface RenderOptions {
  progressOf?: (id: string) => { lit: number; total: number } | null
  /** locked unit 的引导文案（spec v2 §3：卡上直接显示还差 N 步） */
  missingHint?: (id: string) => string | null
  /** 领域色（卡顶色条） */
  domainColor?: (id: string) => string | null
}

export interface BezierSegment {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  p3: { x: number; y: number }
}

/** 边曲线控制点：graphCanvas 与 effects 共用同一算法，保证粒子沿边飞行 */
export function bezierCurve(from: LaidOutNode, to: LaidOutNode): BezierSegment {
  const fx = from.x + from.width / 2
  const fy = from.y + from.height
  const tx = to.x + to.width / 2
  const ty = to.y
  const dy = Math.max(24, (ty - fy) / 2)
  return {
    p0: { x: fx, y: fy },
    p1: { x: fx, y: fy + dy },
    p2: { x: tx, y: ty - dy },
    p3: { x: tx, y: ty }
  }
}

function bezier(from: LaidOutNode, to: LaidOutNode): string {
  const c = bezierCurve(from, to)
  return `M ${c.p0.x} ${c.p0.y} C ${c.p1.x} ${c.p1.y}, ${c.p2.x} ${c.p2.y}, ${c.p3.x} ${c.p3.y}`
}

interface RenderState {
  defs: SVGDefsElement
  viewport: SVGGElement
  layers: { edges: SVGGElement; stubs: SVGGElement; nodes: SVGGElement }
  edgeEls: Map<string, SVGPathElement>
  stubEls: Map<string, SVGGElement>
  nodeEls: Map<string, SVGGElement>
  container: string | null
}

const stateCache = new WeakMap<SVGSVGElement, RenderState>()

function mk(doc: Document, tag: string): SVGElement {
  return doc.createElementNS(SVG_NS, tag) as SVGElement
}

function createState(svgEl: SVGSVGElement): RenderState {
  const doc = svgEl.ownerDocument
  const defs = mk(doc, 'defs') as SVGDefsElement
  const marker = mk(doc, 'marker')
  marker.setAttribute('id', 'arrow')
  marker.setAttribute('viewBox', '0 0 8 8')
  marker.setAttribute('refX', '7')
  marker.setAttribute('refY', '4')
  marker.setAttribute('markerWidth', '7')
  marker.setAttribute('markerHeight', '7')
  marker.setAttribute('orient', 'auto')
  const arrow = mk(doc, 'path')
  arrow.setAttribute('d', 'M0 0L8 4L0 8')
  arrow.setAttribute('fill', 'none')
  arrow.setAttribute('stroke', 'context-stroke')
  marker.appendChild(arrow)
  defs.appendChild(marker)

  const viewport = mk(doc, 'g') as SVGGElement
  viewport.setAttribute('class', 'viewport')
  const layers = {
    edges: mk(doc, 'g') as SVGGElement,
    stubs: mk(doc, 'g') as SVGGElement,
    nodes: mk(doc, 'g') as SVGGElement
  }
  layers.edges.setAttribute('class', 'layer layer--edges')
  layers.stubs.setAttribute('class', 'layer layer--stubs')
  layers.nodes.setAttribute('class', 'layer layer--nodes')
  viewport.appendChild(layers.edges)
  viewport.appendChild(layers.stubs)
  viewport.appendChild(layers.nodes)

  svgEl.appendChild(defs)
  svgEl.appendChild(viewport)
  return {
    defs,
    viewport,
    layers,
    edgeEls: new Map(),
    stubEls: new Map(),
    nodeEls: new Map(),
    container: null
  }
}

function clearLayers(st: RenderState): void {
  for (const layer of [st.layers.edges, st.layers.stubs, st.layers.nodes]) {
    while (layer.firstChild !== null) layer.removeChild(layer.firstChild)
  }
  st.edgeEls.clear()
  st.stubEls.clear()
  st.nodeEls.clear()
}

function setAttrs(el: SVGElement, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
}

export function renderGraph(
  svgEl: SVGSVGElement,
  pack: Pack,
  index: GraphIndex,
  containerId: string,
  layout: Map<string, LaidOutNode>,
  stateOf: (id: string) => NodeState,
  opts: RenderOptions = {}
): void {
  let st = stateCache.get(svgEl)
  if (!st) {
    st = createState(svgEl)
    stateCache.set(svgEl, st)
  }
  const doc = svgEl.ownerDocument
  const containerChanged = st.container !== containerId
  if (containerChanged) {
    st.container = containerId
    clearLayers(st)
  }
  st.viewport.setAttribute('data-container', esc(containerId))

  const byId = (id: string) => layout.get(id)
  const nodeOf = (id: string) => index.nodeById.get(id)
  const children: PackNode[] = []
  for (const id of layout.keys()) {
    const n = index.nodeById.get(id)
    if (n) children.push(n)
  }

  // ---- 边（视图内 hard/soft；箭头指向前置）----
  const edgeSeen = new Set<string>()
  for (const e of pack.edges) {
    const from = byId(e.from)
    const to = byId(e.to)
    if (!from || !to) continue
    const key = e.from + '\u0000' + e.to
    edgeSeen.add(key)
    let el = st.edgeEls.get(key)
    if (!el) {
      el = mk(doc, 'path') as SVGPathElement
      el.setAttribute('class', 'edge')
      st.layers.edges.appendChild(el)
      st.edgeEls.set(key, el)
    }
    setAttrs(el, {
      class: `edge edge--${e.type}`,
      'data-from': esc(e.from),
      'data-to': esc(e.to),
      d: bezier(from, to),
      'marker-end': 'url(#arrow)'
    })
  }
  for (const [key, el] of st.edgeEls) {
    if (!edgeSeen.has(key)) {
      el.remove()
      st.edgeEls.delete(key)
    }
  }

  // ---- 跨视图 stub 徽章（v2 §2：每锚点聚合为 1 条，点击开 DetailPanel）----
  const stubByAnchor = new Map<string, { anchorId: string; extIds: string[]; dir: 'out' | 'in' }>()
  const childIds = new Set(layout.keys())
  for (const e of pack.edges) {
    const inFrom = childIds.has(e.from)
    const inTo = childIds.has(e.to)
    if (inFrom === inTo) continue
    const anchorId = inFrom ? e.from : e.to
    const externalId = inFrom ? e.to : e.from
    const dir = inFrom ? 'out' : 'in'
    const key = anchorId + ':' + dir
    const rec = stubByAnchor.get(key)
    if (rec) rec.extIds.push(externalId)
    else stubByAnchor.set(key, { anchorId, extIds: [externalId], dir })
  }
  const stubSeen = new Set<string>()
  for (const { anchorId, extIds, dir } of stubByAnchor.values()) {
    const anchor = byId(anchorId)
    if (!anchor) continue
    const bx = anchor.x + anchor.width / 2
    const by = dir === 'out' ? anchor.y + anchor.height + 12 : anchor.y - 14
    const n = extIds.length
    const label = dir === 'out' ? `${n} 条后继 →` : `← ${n} 条前置`
    const key = anchorId + ':' + dir
    stubSeen.add(key)
    let el = st.stubEls.get(key)
    if (!el) {
      el = mk(doc, 'g') as SVGGElement
      el.setAttribute('class', 'stub')
      st.layers.stubs.appendChild(el)
      st.stubEls.set(key, el)
    }
    const rect = mk(doc, 'rect')
    setAttrs(rect, { x: String(bx - 46), y: String(by - 9), width: '92', height: '18', rx: '9' })
    const text = mk(doc, 'text')
    setAttrs(text, { x: String(bx), y: String(by + 4) })
    text.textContent = label
    setAttrs(el, { 'data-ext': esc(anchorId), 'data-anchor': esc(anchorId) })
    el.appendChild(rect)
    el.appendChild(text)
  }
  for (const [key, el] of st.stubEls) {
    if (!stubSeen.has(key)) {
      el.remove()
      st.stubEls.delete(key)
    }
  }

  // ---- 节点 ----
  const nodeSeen = new Set<string>()
  for (const n of children) {
    const pos = byId(n.id)
    if (!pos) continue
    nodeSeen.add(n.id)
    let g = st.nodeEls.get(n.id)
    if (!g) {
      g = mk(doc, 'g') as SVGGElement
      g.setAttribute('class', 'node')
      st.layers.nodes.appendChild(g)
      st.nodeEls.set(n.id, g)
    }
    syncNode(doc, g, n, pos, stateOf, opts, nodeOf)
  }
  for (const [id, g] of st.nodeEls) {
    if (!nodeSeen.has(id)) {
      g.remove()
      st.nodeEls.delete(id)
    }
  }
}

function syncNode(
  doc: Document,
  g: SVGGElement,
  n: PackNode,
  pos: LaidOutNode,
  stateOf: (id: string) => NodeState,
  opts: RenderOptions,
  nodeOf: (id: string) => PackNode | undefined
): void {
  const size = NODE_SIZE[n.kind] ?? NODE_SIZE['unit']!
  const state = stateOf(n.id)
  const parentKind = n.parent ? nodeOf(n.parent)?.kind : undefined
  const isSection = n.kind === 'branch' && parentKind === 'unit'
  const cls = `node node--${state} node--${n.kind}${isSection ? ' node--section' : ''}`
  setAttrs(g, {
    class: cls,
    'data-id': esc(n.id),
    transform: `translate(${pos.x}, ${pos.y})`
  })

  // .node-rect 常驻（bloom/unlock-pop/shake 动画作用在它上面，重建会打断动画）
  let rect = g.querySelector('.node-rect') as SVGRectElement | null
  if (!rect) {
    rect = mk(doc, 'rect') as SVGRectElement
    rect.setAttribute('class', 'node-rect')
    g.appendChild(rect)
  }
  setAttrs(rect, { width: String(pos.width), height: String(pos.height), rx: '10' })

  // 重建 rect 之后的子元素（保留 rect 引用）
  const extras: SVGElement[] = []
  const prog = opts.progressOf?.(n.id)
  if (prog && prog.total > 0 && (n.kind === 'branch' || n.kind === 'unit')) {
    const r = n.kind === 'branch' ? 8 : 7
    const cx = pos.width - r - 6
    const cy = r + 9
    const c = 2 * Math.PI * r
    const frac = prog.lit / prog.total
    const bg = mk(doc, 'circle')
    setAttrs(bg, { class: 'ring-bg', cx: String(cx), cy: String(cy), r: String(r) })
    extras.push(bg)
    const ring = mk(doc, 'circle')
    setAttrs(ring, { class: 'ring', cx: String(cx), cy: String(cy), r: String(r) })
    ring.setAttribute('stroke-dasharray', `${(c * frac).toFixed(1)} ${c.toFixed(1)}`)
    extras.push(ring)
    const label = mk(doc, 'text')
    setAttrs(label, { class: 'ring-label', x: String(pos.width - 8), y: String(pos.height - 6), 'text-anchor': 'end' })
    label.textContent = `${prog.lit}/${prog.total}`
    extras.push(label)
  }
  const dColor = opts.domainColor?.(n.id)
  if (dColor && !isSection) {
    const tab = mk(doc, 'rect')
    setAttrs(tab, { class: 'domain-tab', x: '0', y: '0', width: '36', height: '3', rx: '1.5', fill: esc(dColor) })
    extras.push(tab)
  }
  if (isSection) {
    const title = mk(doc, 'text')
    setAttrs(title, { class: 'node-title', x: '14', y: String(size.h / 2 + 5) })
    title.textContent = n.title.zh
    extras.push(title)
  } else {
    const fontSize = n.kind === 'leaf' ? 11 : 13
    const ringSpace = n.kind !== 'leaf' ? 16 : 6
    const availW = pos.width - (state === 'locked' ? 34 : 14) - ringSpace
    const est = n.title.zh.length * fontSize
    const squeeze = est > availW
    if (state === 'locked') {
      const iconG = mk(doc, 'g') as SVGGElement
      iconG.setAttribute('class', 'node-icon')
      iconG.setAttribute('transform', `translate(10, ${(size.h - 16) / 2})`)
      iconG.innerHTML = icon('lock', 16)
      extras.push(iconG)
      const title = mk(doc, 'text')
      const titleAttrs: Record<string, string> = { class: 'node-title', x: '34', y: String(size.h / 2 + 5) }
      if (squeeze) {
        titleAttrs['textLength'] = String(availW)
        titleAttrs['lengthAdjust'] = 'spacingAndGlyphs'
      }
      setAttrs(title, titleAttrs)
      title.textContent = n.title.zh
      extras.push(title)
      const hint = opts.missingHint?.(n.id)
      if (hint) {
        const hintEl = mk(doc, 'text')
        setAttrs(hintEl, { class: 'node-hint', x: '34', y: String(size.h / 2 + 21) })
        hintEl.textContent = hint
        extras.push(hintEl)
      }
    } else {
      const title = mk(doc, 'text')
      const titleAttrs: Record<string, string> = {
        class: 'node-title',
        x: String(n.kind === 'leaf' ? 12 : 14),
        y: String(size.h / 2 + 5)
      }
      if (squeeze) {
        titleAttrs['textLength'] = String(availW)
        titleAttrs['lengthAdjust'] = 'spacingAndGlyphs'
      }
      setAttrs(title, titleAttrs)
      title.textContent = n.title.zh
      extras.push(title)
    }
    if (n.core) {
      const dot = mk(doc, 'circle')
      setAttrs(dot, { class: 'core-dot', cx: String(pos.width - 10), cy: '10', r: '2.5' })
      extras.push(dot)
    }
  }

  for (const ch of Array.from(g.children)) {
    if (ch !== rect) ch.remove()
  }
  let ref: Element = rect
  for (const ex of extras) {
    g.insertBefore(ex, ref.nextSibling)
    ref = ex
  }
}

/** 从事件目标解析所在节点 id（app 层事件委托用） */
export function nodeEl(svgEl: SVGSVGElement, id: string): SVGGElement | null {
  return svgEl.querySelector(`g.node[data-id="${CSS.escape(id)}"]`)
}
