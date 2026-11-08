/** 图核心纯函数（spec §4.1 校验 / §5.2 状态机 / §5.5 路径规划共用） */
import type { Pack, PackEdge, PackNode } from './types'

export type NodeState = 'locked' | 'available' | 'learning' | 'lit'

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

  function descendants(id: string, keep: (n: PackNode) => boolean): PackNode[] {
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
    return out
  }

  return {
    pack,
    nodeById,
    childrenOf(id) {
      return [...(byParent.get(id) ?? [])]
    },
    leavesOf(id) {
      return descendants(id, (n) => n.kind === 'leaf')
    },
    unitsOf(id) {
      return descendants(id, (n) => n.kind === 'unit')
    },
    hardPrereqsOf(unitId) {
      return (hardTo.get(unitId) ?? []).map((id) => nodeById.get(id)!) // 边端点已由校验保证
    },
    softPrereqsOf(unitId) {
      return (softTo.get(unitId) ?? []).map((id) => nodeById.get(id)!)
    },
    hardDependentsOf(unitId) {
      return (hardFrom.get(unitId) ?? []).map((id) => nodeById.get(id)!)
    }
  }
}

/** 容器或叶子是否点亮：叶子按集合；unit/branch 按叶子后代全亮 */
export function isLit(id: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  const node = index.nodeById.get(id)
  if (node === undefined) return false
  if (node.kind === 'leaf') return litLeaves.has(id)
  return index.leavesOf(id).every((l) => litLeaves.has(l.id))
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

/** 未点亮的传递 hard 前置闭包（不含目标自身），按依赖深度排序（前置在前） */
export function minimalHardClosure(
  unitId: string,
  index: GraphIndex,
  litLeaves: Set<string>
): string[] {
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
  return out.reverse() // BFS 先发现近层，反转后最深的 prereq 在前
}
