/**
 * view/highlightPath.ts — 依赖链高亮（补上 graph.css 里一直没人加 class 的那三个类）
 *
 * 现状：graph.css 已定义 `.edge.in-path`、`.edge.missing-prereq`、`.node.in-path`，
 * 但全项目没有任何代码添加这些 class → README 里「前置链高亮」名不副实，
 * 用户看不到「为什么这个单元锁着」。
 *
 * 与队友 A（增量渲染）的兼容性 —— 重要，他会看这段：
 *  applyHighlight / clearHighlight **只在已存在的元素上增删 class**，
 *  用 querySelector('[data-from="..."][data-to="..."]') 定位，
 *  绝不创建、删除、重建任何 DOM 节点，也不写 innerHTML。
 *  因此 A 的增量 diff 只看到 class 属性差异，不会与他的结构 diff 打架；
 *  clearHighlight 只移除本模块自己加过的 class（内部用 WeakMap 记录 applied 集合），
 *  不会误删 A 加上的其它 class。
 *
 * 性能：192 unit / 660 边规模下，单次 hover 计算的图访问次数有硬上界
 *  （每个 unit 在向上/向下各至多访问一次，isLit 结果按 unit 缓存），
 *  返回值里带 stats.traversed，单测直接断言上界。
 */
import type { GraphIndex } from '../core/graph'

/** 边 key 的分隔符：`from>to` */
export const EDGE_KEY_SEP = '>'
export const edgeKey = (from: string, to: string): string => `${from}${EDGE_KEY_SEP}${to}`

export type HighlightEdgeKind = 'in-path' | 'missing-prereq'

export interface HighlightEdge {
  key: string
  kind: HighlightEdgeKind
}

export type HighlightModeName =
  /** 全部 hard 前置闭包 + 直接后继（默认） */
  | 'closure'
  /** 只算直接 hard 前置 + 直接后继（最浅最快） */
  | 'direct'
  /** 闭包 + soft 前置 */
  | 'closure+soft'
  /** 闭包 + soft 前置 + 传递后继 */
  | 'full'

export interface HighlightOptions {
  soft?: boolean
  dependents?: boolean
  deepDependents?: boolean
  /** 是否传递展开 hard 前置（false = 只算直接前置），默认 true */
  deepPrereqs?: boolean
  /** 防御性访问上限（异常数据成环时兜底），默认 4000 */
  maxVisits?: number
}

export interface HighlightResult {
  edges: HighlightEdge[]
  /** 链上「已满足」的 unit id → 加 .in-path */
  nodes: string[]
  /** 链上「未点亮的前置」unit id → 加 .in-path + 缺失标记 */
  missingNodes: string[]
  /** 悬停节点归属的 unit（叶子/分支沿 parent 上溯）；无归属时 null */
  focus: string | null
  stats: { traversed: number; units: number; edges: number }
}

interface ResolvedOptions {
  soft: boolean
  dependents: boolean
  deepDependents: boolean
  deepPrereqs: boolean
  maxVisits: number
}

const MODE_PRESET: Record<HighlightModeName, ResolvedOptions> = {
  closure: { soft: false, dependents: true, deepDependents: false, deepPrereqs: true, maxVisits: 4000 },
  direct: { soft: false, dependents: true, deepDependents: false, deepPrereqs: false, maxVisits: 4000 },
  'closure+soft': { soft: true, dependents: true, deepDependents: false, deepPrereqs: true, maxVisits: 4000 },
  full: { soft: true, dependents: true, deepDependents: true, deepPrereqs: true, maxVisits: 4000 }
}

/** 单元是否已点亮：叶子后代全亮（无叶单元不算亮，与 graph.isLit 对 unit 的口径一致） */
function unitIsLit(
  unitId: string,
  index: GraphIndex,
  litLeaves: Set<string>,
  cache: Map<string, boolean>
): boolean {
  const hit = cache.get(unitId)
  if (hit !== undefined) return hit
  const leaves = index.leavesOf(unitId)
  const v = leaves.length > 0 && leaves.every((l) => litLeaves.has(l.id))
  cache.set(unitId, v)
  return v
}

/** 沿 parent 链上溯到最近的 unit 祖先（leaf / branch / 章分组悬停都归到 unit 粒度） */
function unitContext(id: string, index: GraphIndex): string | null {
  const node = index.nodeById.get(id)
  if (node === undefined) return null
  if (node.kind === 'unit') return node.id
  let cur = node.parent
  let guard = 0
  while (cur !== null && guard++ < 32) {
    const p = index.nodeById.get(cur)
    if (p === undefined) return null
    if (p.kind === 'unit') return p.id
    cur = p.parent
  }
  return null
}

/**
 * 计算高亮集合。纯计算，不碰 DOM。
 * @param nodeId 悬停的节点 id（leaf / unit / branch 都接受）
 * @param mode   'closure'(默认) | 'direct' | 'closure+soft' | 'full'，或逐项覆盖的 options
 */
export function computeHighlight(
  nodeId: string,
  index: GraphIndex,
  litLeaves: Set<string>,
  mode: HighlightModeName | HighlightOptions = 'closure'
): HighlightResult {
  const preset: ResolvedOptions =
    typeof mode === 'string'
      ? MODE_PRESET[mode]
      : {
          soft: mode.soft ?? false,
          dependents: mode.dependents ?? true,
          deepDependents: mode.deepDependents ?? false,
          deepPrereqs: mode.deepPrereqs ?? true,
          maxVisits: mode.maxVisits ?? 4000
        }

  const edges: HighlightEdge[] = []
  const nodes: string[] = []
  const missingNodes: string[] = []
  const seenEdge = new Set<string>()
  const inNodes = new Set<string>()
  const inMissing = new Set<string>()
  const litCache = new Map<string, boolean>()
  let traversed = 0

  function pushNode(id: string, missing: boolean): void {
    if (missing) {
      if (inMissing.has(id)) return
      inMissing.add(id)
      missingNodes.push(id)
    } else {
      if (inNodes.has(id)) return
      inNodes.add(id)
      nodes.push(id)
    }
  }
  function pushEdge(from: string, to: string, missing: boolean): void {
    const key = edgeKey(from, to)
    if (seenEdge.has(key)) return
    seenEdge.add(key)
    edges.push({ key, kind: missing ? 'missing-prereq' : 'in-path' })
  }

  const focusUnit = unitContext(nodeId, index)
  if (focusUnit === null) {
    return { edges, nodes, missingNodes, focus: null, stats: { traversed, units: litCache.size, edges: 0 } }
  }
  pushNode(focusUnit, false)

  // ---- 向上：hard 前置（direct 只一层；closure/full 走闭包） ----
  const upSeen = new Set<string>([focusUnit])
  let frontier: string[] = [focusUnit]
  let depth = 0
  while (frontier.length > 0 && traversed++ < preset.maxVisits) {
    const next: string[] = []
    for (const id of frontier) {
      for (const p of index.hardPrereqsOf(id)) {
        const lit = unitIsLit(p.id, index, litLeaves, litCache)
        pushEdge(p.id, id, !lit)
        pushNode(p.id, !lit)
        if (upSeen.has(p.id)) continue
        upSeen.add(p.id)
        if (preset.deepPrereqs) next.push(p.id)
      }
    }
    depth++
    if (!preset.deepPrereqs) break
    if (depth > 64) break // 防御：层数异常（数据成环时 hardPrereqs 已被 upSeen 挡住，这里是双保险）
    frontier = next
  }

  // ---- soft 前置（可开关；只看闭包内 unit 的直接 soft 边） ----
  if (preset.soft) {
    for (const id of upSeen) {
      if (traversed++ > preset.maxVisits) break
      for (const p of index.softPrereqsOf(id)) {
        const lit = unitIsLit(p.id, index, litLeaves, litCache)
        pushEdge(p.id, id, !lit)
        pushNode(p.id, !lit)
      }
    }
  }

  // ---- 向下：依赖者（默认只直接后继；full 传递展开） ----
  if (preset.dependents) {
    const downSeen = new Set<string>([focusUnit])
    let downFrontier: string[] = [focusUnit]
    while (downFrontier.length > 0 && traversed++ < preset.maxVisits) {
      const nextDown: string[] = []
      for (const id of downFrontier) {
        for (const d of index.hardDependentsOf(id)) {
          const lit = unitIsLit(d.id, index, litLeaves, litCache)
          pushEdge(id, d.id, !lit)
          pushNode(d.id, !lit)
          if (downSeen.has(d.id)) continue
          downSeen.add(d.id)
          if (preset.deepDependents) nextDown.push(d.id)
        }
      }
      if (!preset.deepDependents) break
      downFrontier = nextDown
    }
  }

  return {
    edges,
    nodes,
    missingNodes,
    focus: focusUnit,
    stats: { traversed, units: litCache.size, edges: edges.length }
  }
}

// ───────────────────────────── DOM 应用层 ─────────────────────────────

/**
 * 把 computeHighlight 结果落到已有 svg 元素：只做 classList.add/remove。
 * 绝不重建 DOM（与队友 A 的增量渲染兼容）；querySelector 找不到就静默跳过
 * （增量渲染尚未画出的边，下次 hover 自然补上）。
 */
const EDGE_CLASS = 'edge'
const NODE_CLASS = 'node'
/** graph.css 没有「缺失节点」类，用本模块 ui.css 补充；不覆盖队友样式文件 */
const MISSING_NODE_CLASS = 'node--missing-prereq'

interface Applied {
  edges: HighlightEdge[]
  nodes: string[]
  missing: string[]
}

const applied = new WeakMap<Element, Applied>()

function cssAttr(v: string): string {
  // 属性选择器值用双引号包裹；对 \ 与 " 做转义（id 里理论上不会出现，防御性保留）
  return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/** 找到一条边的元素；不存在返回 null */
export function findEdge(svgRoot: Element, from: string, to: string): Element | null {
  return svgRoot.querySelector(
    `.${EDGE_CLASS}[data-from=${cssAttr(from)}][data-to=${cssAttr(to)}]`
  )
}

/** 找到一个节点的元素（graphCanvas 的结构是 g.node[data-id]） */
export function findNode(svgRoot: Element, id: string): Element | null {
  return svgRoot.querySelector(`.${NODE_CLASS}[data-id=${cssAttr(id)}]`)
}

function splitKey(key: string): [string, string] | null {
  const at = key.indexOf(EDGE_KEY_SEP)
  if (at <= 0 || at === key.length - 1) return null
  return [key.slice(0, at), key.slice(at + EDGE_KEY_SEP.length)]
}

export function applyHighlight(svgRoot: Element, result: HighlightResult): void {
  clearHighlight(svgRoot)
  const rec: Applied = { edges: [], nodes: [], missing: [] }
  for (const e of result.edges) {
    const pair = splitKey(e.key)
    if (pair === null) continue
    const el = findEdge(svgRoot, pair[0], pair[1])
    if (el === null) continue
    el.classList.add(e.kind)
    rec.edges.push(e)
  }
  for (const id of result.nodes) {
    const el = findNode(svgRoot, id)
    if (el === null) continue
    el.classList.add('in-path')
    rec.nodes.push(id)
  }
  for (const id of result.missingNodes) {
    const el = findNode(svgRoot, id)
    if (el === null) continue
    el.classList.add('in-path', MISSING_NODE_CLASS)
    rec.missing.push(id)
  }
  applied.set(svgRoot, rec)
}

/** 精确回收：只移除 applyHighlight 加上的 class，不影响其它模块加的 class */
export function clearHighlight(svgRoot: Element): void {
  const rec = applied.get(svgRoot)
  if (rec === undefined) return
  for (const e of rec.edges) {
    const pair = splitKey(e.key)
    if (pair === null) continue
    const el = findEdge(svgRoot, pair[0], pair[1])
    if (el !== null) el.classList.remove(e.kind)
  }
  for (const id of rec.nodes) {
    const el = findNode(svgRoot, id)
    if (el !== null) el.classList.remove('in-path')
  }
  for (const id of rec.missing) {
    const el = findNode(svgRoot, id)
    if (el !== null) el.classList.remove('in-path', MISSING_NODE_CLASS)
  }
  applied.delete(svgRoot)
}

/**
 * svg mouseover/mouseout 委托接线器：lead 在 main.ts 里调用一次即完成集成。
 * get() 每次 hover 惰性取当前 index/litLeaves（store 换代、包切换后不用重绑）。
 */
export interface HighlightBinderHandle {
  enable(): void
  disable(): void
  destroy(): void
}

export interface HighlightContext {
  index: GraphIndex
  litLeaves: Set<string>
}

export function bindHoverHighlight(
  svgRoot: Element,
  get: (nodeId: string) => HighlightContext | null,
  mode: HighlightModeName | HighlightOptions = 'closure',
  hooks?: { onHighlight?: (result: HighlightResult) => void; onClear?: () => void }
): HighlightBinderHandle {
  let enabled = true
  let current: string | null = null

  const over = (ev: Event): void => {
    if (!enabled) return
    const target = ev.target as Element | null
    if (target === null || typeof target.closest !== 'function') return
    const g = target.closest(`.${NODE_CLASS}`) as Element | null
    const id = g?.getAttribute('data-id') ?? null
    if (id === current) return
    if (id === null) {
      current = null
      clearHighlight(svgRoot)
      hooks?.onClear?.()
      return
    }
    const ctx = get(id)
    if (ctx === null) return
    const res = computeHighlight(id, ctx.index, ctx.litLeaves, mode)
    applyHighlight(svgRoot, res)
    current = id
    hooks?.onHighlight?.(res)
  }

  const out = (ev: Event): void => {
    if (!enabled) return
    const related = (ev as MouseEvent).relatedTarget as Element | null
    if (related !== null && typeof related.closest === 'function' && related.closest(`.${NODE_CLASS}`) !== null) return
    current = null
    clearHighlight(svgRoot)
    hooks?.onClear?.()
  }

  svgRoot.addEventListener('mouseover', over)
  svgRoot.addEventListener('mouseout', out)

  return {
    enable() {
      enabled = true
    },
    disable() {
      enabled = false
      current = null
      clearHighlight(svgRoot)
      hooks?.onClear?.()
    },
    destroy() {
      svgRoot.removeEventListener('mouseover', over)
      svgRoot.removeEventListener('mouseout', out)
      clearHighlight(svgRoot)
    }
  }
}
