/** SVG 图谱渲染（spec §5.3/§5.4）：纯渲染函数，交互由 app 层以事件委托接线 */
import type { GraphIndex, NodeState } from '../core/graph'
import type { Pack, PackNode } from '../core/types'
import { NODE_SIZE, ROOT_VIEW, type LaidOutNode } from '../layout/elk'
import { icon } from './icons'

export interface RenderOptions {
  progressOf?: (id: string) => { lit: number; total: number } | null
  onStubClick?: (externalId: string) => void
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function bezier(from: LaidOutNode, to: LaidOutNode): string {
  const fx = from.x + from.width / 2
  const fy = from.y + from.height
  const tx = to.x + to.width / 2
  const ty = to.y
  const dy = Math.max(24, (ty - fy) / 2)
  return `M ${fx} ${fy} C ${fx} ${fy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`
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
  const children =
    containerId === ROOT_VIEW ? pack.nodes.filter((n) => n.parent === null) : index.childrenOf(containerId)
  const childIds = new Set(children.map((c) => c.id))
  const byId = (id: string) => layout.get(id)
  const nodeOf = (id: string) => index.nodeById.get(id)

  const parts: string[] = []
  parts.push('<defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="context-stroke"/></marker></defs>')
  parts.push('<g class="viewport" data-container="' + esc(containerId) + '">')

  // 边（视图内 hard/soft；箭头指向前置）
  for (const e of pack.edges) {
    const from = byId(e.from)
    const to = byId(e.to)
    if (!from || !to) continue
    parts.push(
      `<path class="edge edge--${e.type}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${bezier(from, to)}" marker-end="url(#arrow)"/>`
    )
  }

  // 跨视图 stub 徽章（spec §5.3）
  for (const e of pack.edges) {
    const inFrom = childIds.has(e.from)
    const inTo = childIds.has(e.to)
    if (inFrom === inTo) continue
    const anchorId = inFrom ? e.from : e.to
    const externalId = inFrom ? e.to : e.from
    const anchor = byId(anchorId)
    const extNode = nodeOf(externalId)
    if (!anchor || !extNode) continue
    const bx = anchor.x + anchor.width / 2
    const by = inFrom ? anchor.y + anchor.height + 12 : anchor.y - 14
    const label = extNode.title.zh.slice(0, 6)
    parts.push(
      `<g class="stub stub--${e.type}" data-ext="${esc(externalId)}" data-anchor="${esc(anchorId)}">` +
        `<rect x="${bx - 40}" y="${by - 9}" width="80" height="18" rx="9"/>` +
        `<text x="${bx}" y="${by + 4}">${inFrom ? '→' : '←'} ${esc(label)}</text></g>`
    )
  }

  // 节点
  for (const n of children) {
    const pos = byId(n.id)
    if (!pos) continue
    const size = NODE_SIZE[n.kind] ?? NODE_SIZE['unit']!
    const state = stateOf(n.id)
    const cls = `node node--${state} node--${n.kind}`
    let inner = ''
    // 容器进度环
    const prog = opts.progressOf?.(n.id)
    if (prog && prog.total > 0 && (n.kind === 'branch' || n.kind === 'unit')) {
      const r = n.kind === 'branch' ? 8 : 7
      const cx = pos.width - r - 6
      const cy = r + 6
      const c = 2 * Math.PI * r
      const frac = prog.lit / prog.total
      inner +=
        `<circle class="ring-bg" cx="${cx}" cy="${cy}" r="${r}"/>` +
        `<circle class="ring" cx="${cx}" cy="${cy}" r="${r}" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}"/>` +
        `<text class="ring-label" x="${cx}" y="${cy + r + 10}">${prog.lit}/${prog.total}</text>`
    }
    // 锁图标（locked 状态）
    if (state === 'locked') {
      inner += `<g class="node-icon" transform="translate(10, ${(size.h - 16) / 2})">${icon('lock', 16)}</g>`
      inner += `<text class="node-title" x="34" y="${size.h / 2 + 5}">${esc(n.title.zh.slice(0, 9))}</text>`
    } else {
      inner += `<text class="node-title" x="${n.kind === 'leaf' ? 12 : 14}" y="${size.h / 2 + 5}">${esc(n.title.zh.slice(0, 12))}</text>`
    }
    if (n.core) inner += `<circle class="core-dot" cx="${pos.width - 10}" cy="10" r="2.5"/>`
    parts.push(
      `<g class="${cls}" data-id="${esc(n.id)}" transform="translate(${pos.x}, ${pos.y})">` +
        `<rect class="node-rect" width="${pos.width}" height="${pos.height}" rx="10"/>${inner}</g>`
    )
  }

  parts.push('</g>')
  svgEl.innerHTML = parts.join('')
}

/** 从事件目标解析所在节点 id（app 层事件委托用） */
export function nodeIdFromEvent(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const g = target.closest('g.node')
  if (g instanceof SVGGElement) return g.getAttribute('data-id')
  const stub = target.closest('g.stub')
  if (stub instanceof SVGGElement) {
    const ext = stub.getAttribute('data-ext')
    if (ext) {
      const detail = new CustomEvent('stub-click', { detail: ext })
      stub.dispatchEvent(detail)
    }
    return null
  }
  return null
}

export function nodeEl(svgEl: SVGSVGElement, id: string): SVGGElement | null {
  return svgEl.querySelector(`g.node[data-id="${CSS.escape(id)}"]`)
}

export function nodeRectOf(node: PackNode, layout: LaidOutNode): LaidOutNode {
  return layout
}
