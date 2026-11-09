/** 图核心纯函数（spec §4.1 校验 / §5.2 状态机 / §5.5 路径规划共用）
 *
 * 性能说明（opt/data-perf，2.1）：
 * - index 由 pack 构建、pack 在 index 生命周期内不变 ⇒ childrenOf / leavesOf / unitsOf /
 *   hardPrereqsOf / softPrereqsOf / hardDependentsOf / governingUnitOf 一次性记忆化。
 * - 缓存数组以 Object.freeze 冻结后返回「缓存本体」（零拷贝）。选冻结而不是返回拷贝的理由：
 *   返回拷贝会把省下来的分配又花回去（8112 叶 × 每帧多次），而冻结在 ESM strict 下让任何
 *   push/sort/赋值立刻 TypeError，把「调用方改动污染缓存」变成响亮失败而不是静默错误。
 *   实测全仓调用方对这些数组只读（map / some / every / find / 下标 / for..of / 展开再拷贝）。
 * - stats()/resetStats() 暴露「真实展开次数」，供 tests/core/perf.test.ts 做计数器断言
 *   （代价不随渲染次数线性增长），不依赖 wall-clock。
 * - isLit / unitAvailable / leafAvailable / aggregateState / detectCycle /
 *   minimalHardClosure 的行为与签名保持不变；minimalHardClosure 额外按
 *   (index, litLeaves) 身份记忆化（每次仍返回新数组），带快照的入口见 createStateEvaluator。
 */
import type { Pack, PackEdge, PackNode } from './types'

export type NodeState = 'locked' | 'available' | 'learning' | 'lit'

/** 派生表记忆化计数（可观测性） */
export interface GraphIndexStats {
  /** 命中缓存次数（全部派生方法合计） */
  hits: number
  /** 真实计算次数（全部派生方法合计） */
  misses: number
  /** 按方法名细分的真实计算次数 */
  byMethod: Record<string, number>
}

export interface GraphIndex {
  pack: Pack
  nodeById: Map<string, PackNode>
  childrenOf(id: string): PackNode[]
  /** 全部叶子后代（叶子自身返回 [self]） */
  leavesOf(id: string): PackNode[]
  /** unit 后代（含自身若为 unit） */
  unitsOf(id: string): PackNode[]
  hardPrereqsOf(unitId: string): PackNode[]
  softPrereqsOf(unitId: string): PackNode[]
  hardDependentsOf(unitId: string): PackNode[]
  /** 门控该叶子的 unit（沿 parent 链上溯第一个 unit；无则 undefined） */
  governingUnitOf(leafId: string): string | undefined
  /** 父先于子的节点序列（快照自顶向下传播用）；构建一次 */
  topoOrder(): PackNode[]
  stats(): GraphIndexStats
  resetStats(): void
}

export function buildGraphIndex(pack: Pack): GraphIndex {
  const nodeById = new Map<string, PackNode>()
  for (const n of pack.nodes) nodeById.set(n.id, n)

  const byParent = new Map<string, PackNode[]>()
  for (const n of pack.nodes) {
    if (n.parent === null) continue
    const list = byParent.get(n.parent) ?? []
    list.push(n)
    byParent.set(n.parent, list)
  }
  // 构建期结束后冻结子表：运行期任何写入都会响亮失败
  for (const [k, v] of byParent) byParent.set(k, Object.freeze(v) as PackNode[])

  const hardFrom = new Map<string, string[]>() // from → [to]
  const hardTo = new Map<string, string[]>() // to → [from]
  const softTo = new Map<string, string[]>()
  for (const e of pack.edges) {
    if (e.type === 'hard') {
      const l = hardFrom.get(e.from) ?? []
      l.push(e.to)
      hardFrom.set(e.from, l)
      const r = hardTo.get(e.to) ?? []
      r.push(e.from)
      hardTo.set(e.to, r)
    } else {
      const r = softTo.get(e.to) ?? []
      r.push(e.from)
      softTo.set(e.to, r)
    }
  }
  for (const m of [hardFrom, hardTo, softTo])
    for (const [k, v] of m) m.set(k, Object.freeze(v) as string[])

  const stats: GraphIndexStats = { hits: 0, misses: 0, byMethod: {} }
  const count = (method: string, hit: boolean): void => {
    if (hit) stats.hits++
    else {
      stats.misses++
      stats.byMethod[method] = (stats.byMethod[method] ?? 0) + 1
    }
  }

  /** 自顶向下展开一次、缓存冻结结果 */
  const subtree = (
    id: string,
    keep: (n: PackNode) => boolean,
    memo: Map<string, PackNode[]>,
    method: string
  ): PackNode[] => {
    const hit = memo.get(id)
    if (hit !== undefined) {
      count(method, true)
      return hit
    }
    count(method, false)
    const out: PackNode[] = []
    const stack = [id]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const node = nodeById.get(cur)
      if (node && keep(node)) out.push(node)
      for (const child of byParent.get(cur) ?? []) stack.push(child.id)
    }
    const frozen = Object.freeze(out) as PackNode[]
    memo.set(id, frozen)
    return frozen
  }

  const edgeList = (
    map: Map<string, string[]>,
    id: string,
    memo: Map<string, PackNode[]>,
    method: string
  ): PackNode[] => {
    const hit = memo.get(id)
    if (hit !== undefined) {
      count(method, true)
      return hit
    }
    count(method, false)
    const out: PackNode[] = []
    for (const eid of map.get(id) ?? []) {
      const node = nodeById.get(eid)
      if (node !== undefined) out.push(node) // 边端点已由校验保证，缺失时保守跳过
    }
    const frozen = Object.freeze(out) as PackNode[]
    memo.set(id, frozen)
    return frozen
  }

  const leafMemo = new Map<string, PackNode[]>()
  const unitMemo = new Map<string, PackNode[]>()
  const childMemo = new Map<string, PackNode[]>()
  const hardPrereqMemo = new Map<string, PackNode[]>()
  const softPrereqMemo = new Map<string, PackNode[]>()
  const hardDepMemo = new Map<string, PackNode[]>()

  /** 叶子 → 门控 unit：index 生命周期内恒定（undefined 也算已缓存） */
  const guardMemo = new Map<string, string | undefined>()
  function governingUnitOf(leafId: string): string | undefined {
    if (guardMemo.has(leafId)) {
      count('governingUnitOf', true)
      return guardMemo.get(leafId)
    }
    count('governingUnitOf', false)
    const leaf = nodeById.get(leafId)
    let unit: string | undefined = undefined
    if (leaf !== undefined) {
      let cur = leaf.parent
      let guard = 0
      while (cur !== null && guard++ < 64) {
        const node = nodeById.get(cur)
        if (node === undefined) break
        if (node.kind === 'unit') {
          unit = node.id
          break
        }
        cur = node.parent
      }
    }
    guardMemo.set(leafId, unit)
    return unit
  }

  let topo: PackNode[] | null = null
  function topoOrder(): PackNode[] {
    if (topo !== null) return topo
    const out: PackNode[] = []
    const placed = new Set<string>()
    let progressed = true
    while (out.length < pack.nodes.length && progressed) {
      progressed = false
      for (const n of pack.nodes) {
        if (placed.has(n.id)) continue
        if (n.parent !== null && !placed.has(n.parent)) continue
        placed.add(n.id)
        out.push(n)
        progressed = true
      }
    }
    // schema 已排除 parent 成环；兜底补齐（不缩小可用范围）
    for (const n of pack.nodes) if (!placed.has(n.id)) out.push(n)
    topo = Object.freeze(out) as PackNode[]
    return topo
  }

  return {
    pack,
    nodeById,
    childrenOf(id: string) {
      const hit = childMemo.get(id)
      if (hit !== undefined) {
        count('childrenOf', true)
        return hit
      }
      count('childrenOf', false)
      const frozen = Object.freeze([...(byParent.get(id) ?? [])]) as PackNode[]
      childMemo.set(id, frozen)
      return frozen
    },
    leavesOf(id: string) {
      return subtree(id, (n) => n.kind === 'leaf', leafMemo, 'leavesOf')
    },
    unitsOf(id: string) {
      return subtree(id, (n) => n.kind === 'unit', unitMemo, 'unitsOf')
    },
    hardPrereqsOf(unitId: string) {
      return edgeList(hardTo, unitId, hardPrereqMemo, 'hardPrereqsOf')
    },
    softPrereqsOf(unitId: string) {
      return edgeList(softTo, unitId, softPrereqMemo, 'softPrereqsOf')
    },
    hardDependentsOf(unitId: string) {
      return edgeList(hardFrom, unitId, hardDepMemo, 'hardDependentsOf')
    },
    governingUnitOf,
    topoOrder,
    stats() {
      return { hits: stats.hits, misses: stats.misses, byMethod: { ...stats.byMethod } }
    },
    resetStats() {
      stats.hits = 0
      stats.misses = 0
      stats.byMethod = {}
    }
  }
}

/** 容器或叶子是否点亮：叶子按集合；unit/branch 按叶子后代全亮（无叶容器不虚亮） */
export function isLit(id: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  const node = index.nodeById.get(id)
  if (node === undefined) return false
  if (node.kind === 'leaf') return litLeaves.has(id)
  const leaves = index.leavesOf(id)
  if (leaves.length === 0) return false // 空容器（审查发现 252 个虚点亮）：不视为已点亮
  return leaves.every((l) => litLeaves.has(l.id))
}

/** unit 解锁 ⇔ 全部 hard 前置 unit 已 lit */
export function unitAvailable(unitId: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  return index
    .hardPrereqsOf(unitId)
    .every((p) => isLit(p.id, index, litLeaves))
}

export function leafAvailable(leafId: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  // 叶子的 parent 可能是章分组（branch），沿 parent 链上溯到最近的 unit 祖先判定门控
  const leaf = index.nodeById.get(leafId)
  if (leaf === undefined) return false
  let cur = leaf.parent
  let guard = 0
  while (cur !== null && guard++ < 64) {
    const node = index.nodeById.get(cur)
    if (node === undefined) return false
    if (node.kind === 'unit') return unitAvailable(node.id, index, litLeaves)
    cur = node.parent
  }
  return false
}

/** 四态聚合（spec §5.2）：lit 优先于 learning；叶子可用性随所属单元 */
export function aggregateState(
  id: string,
  index: GraphIndex,
  litLeaves: Set<string>,
  learning: Record<string, string>
): NodeState {
  if (isLit(id, index, litLeaves)) return 'lit'
  if (learning[id] !== undefined) return 'learning'
  const node = index.nodeById.get(id)
  if (node === undefined) return 'locked'
  if (node.kind === 'leaf') return leafAvailable(id, index, litLeaves) ? 'available' : 'locked'
  if (node.kind === 'unit') return unitAvailable(id, index, litLeaves) ? 'available' : 'locked'
  // branch：至少一个后代叶子可点亮 → available，否则 locked
  const anyAvailable = index
    .leavesOf(id)
    .some((l) => leafAvailable(l.id, index, litLeaves))
  return anyAvailable ? 'available' : 'locked'
}

/** 加入候选边后是否成环；成环返回路径（首尾同 id），无环返回 null */
export function detectCycle(edge: PackEdge, pack: Pack): string[] | null {
  const edges = [...pack.edges, edge]
  const units = new Set(pack.nodes.filter((n) => n.kind === 'unit').map((n) => n.id))
  const inDeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of units) {
    inDeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    if (!units.has(e.from) || !units.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
  }
  const queue = [...units].filter((id) => (inDeg.get(id) ?? 0) === 0)
  let visited = 0
  while (queue.length > 0) {
    const cur = queue.pop()!
    visited++
    for (const next of adj.get(cur) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1
      inDeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (visited === units.size) return null

  // Kahn 剩余节点在环上；沿依赖链重建路径（edge.to 为环入口）
  const onCycle = new Set([...units].filter((id) => (inDeg.get(id) ?? 0) > 0))
  const path: string[] = [edge.to]
  let cur = edge.from
  let guard = 0
  while (cur !== edge.to && guard++ < units.size) {
    path.push(cur)
    const next = (adj.get(cur) ?? []).find((n) => onCycle.has(n))
    if (next === undefined) return [...path, edge.to] // 理论不可达，保守返回
    cur = next
  }
  path.push(edge.to)
  return path
}

/**
 * 未点亮的传递 hard 前置闭包（不含目标自身），按依赖深度排序（前置在前）。
 * 纯函数语义不变；内部按 (index, litLeaves) 对象身份记忆化——main.ts 的 missingHint 对每个
 * locked 节点都调一次，同一次渲染里同一 progress 世代重复调用命中缓存。每次仍返回新数组，
 * 调用方拿到可自由改动的副本（闭包长度很小，拷贝代价可忽略）。
 */
const closureMemo = new WeakMap<GraphIndex, WeakMap<Set<string>, Map<string, string[]>>>()

export function minimalHardClosure(
  unitId: string,
  index: GraphIndex,
  litLeaves: Set<string>
): string[] {
  const byLeaves = closureMemo.get(index) ?? new WeakMap<Set<string>, Map<string, string[]>>()
  closureMemo.set(index, byLeaves)
  const byId = byLeaves.get(litLeaves) ?? new Map<string, string[]>()
  byLeaves.set(litLeaves, byId)
  const hit = byId.get(unitId)
  if (hit !== undefined) return [...hit]

  const out: string[] = []
  const seen = new Set<string>([unitId])
  let layer = index.hardPrereqsOf(unitId).map((n) => n.id)
  while (layer.length > 0) {
    const nextLayer: string[] = []
    for (const id of layer) {
      if (seen.has(id)) continue
      seen.add(id)
      if (!isLit(id, index, litLeaves)) out.push(id)
      for (const p of index.hardPrereqsOf(id)) nextLayer.push(p.id)
    }
    layer = nextLayer
  }
  const result = out.reverse() // BFS 先发现近层，反转后最深的 prereq 在前
  byId.set(unitId, result)
  return [...result]
}
