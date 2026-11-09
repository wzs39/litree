/**
 * PathTrace（点亮路径规划）——docs/research/2026-11-08-similar-solutions-study.md §3/§8 第 3 条
 * 把「🔒 还差 N 步」变成「按顺序点下去就行」。
 *
 * 三条必读约束（后面有人会用错）：
 * 1. **门控语义的唯一实现是 `../core/graph`**。本文件只调用、绝不重定义：
 *    `planLightChain` 的每个 step 都以 `leafAvailable` 的返回值为准入条件，
 *    未解锁 unit 的叶子绝不进 steps。UI 侧每次"点亮"前再校验一次（见 `pickNextLeafId`）。
 * 2. **`hard` 参与门控，`soft` 永远不参与**：
 *    - `includeSoftPrereq` 默认 `false`：soft 边一眼都不看，既不阻塞也不产生点亮义务；
 *    - 显式 `true`：soft 前置闭包**只用来调整同深度 unit 的先后**（排序参考），
 *      不新增任何必须点亮的 unit/叶子，也不影响 `canLightTargetNow`。
 *    把它理解成"顺便把 soft 前置也点亮"是错的——那会凭空造出点亮义务、并且改变 remaining 口径。
 * 3. **纯函数 + 不可变**：不修改传入的 `litLeaves`，不修改 index，返回全新对象。
 *
 * UI 层自包含 + 依赖注入：不 import graphCanvas / detailPanel / store，只操作自己那棵 DOM。
 */
import type { GraphIndex } from '../core/graph'
import { isLit, leafAvailable, minimalHardClosure, unitAvailable } from '../core/graph'
import type { PackNode } from '../core/types'
import '../styles/pathtrace.css'

/* ------------------------------------------------------------------ */
/* 3.1 纯函数层                                                        */
/* ------------------------------------------------------------------ */

/** 一步 = 点亮一个叶子 */
export interface TraceStep {
  /** 待点亮叶子所属 unit */
  unitId: string
  /** 本步要点亮的叶子 */
  leafId: string
  /** 全局顺序（拓扑序，前置在前），1 起 */
  order: number
  /** 面包屑：从 root 到 leaf 的节点 id 链（首元素恒为虚拟根 'root'） */
  path: string[]
  /** 对应的中文标题链（与 path 同长） */
  pathLabels: string[]
}

export type TraceBlocker =
  /** 前置 unit 已解锁，但本轮拿不出任何可点亮的叶子（空容器 / 叶子全亮 / 被更深的门控挡住） */
  | { kind: 'no-available-leaf'; unitId: string; reason: string }
  /** 数据异常：引用了 pack 里不存在的节点（targetId、parent 链断点、边端点缺失） */
  | { kind: 'missing-pack-node'; id: string }
  /** hard 前置边成环（异常数据兜底）；ids 为排在环上/无法定序的 unit */
  | { kind: 'cycle-suspected'; ids: string[] }
  /** 目标自身已经完全点亮 */
  | { kind: 'already-lit'; unitId: string }

export interface LightChainPlan {
  /** 用户想看的那条 locked 单元/叶子 */
  targetId: string
  /** 目标类型（branch 目标按 'unit' 口径展开其 unit 后代） */
  targetKind: 'unit' | 'leaf'
  /** 目标自身（其 unit 组）已点亮的叶子数 */
  litCount: number
  /** 把目标推到"全部点亮"所需的叶子总数（作用域内叶子并集大小） */
  totalNeeded: number
  /**
   * 还需点亮的叶子总数（保守估计：闭包内所有未亮叶子 + 目标自身未亮叶子）。
   * 恒等于 `remainingLeaves`，保留这个名字以兼容既有"还差 N 步"的调用习惯。
   */
  remainingSteps: number
  /**
   * **口径 A · unit 数**：仍未点亮的传递 hard 前置 unit 个数
   * = `minimalHardClosure(target).length`，与既有文案「🔒 还差 N 步」的 N **同源**。
   * 老文案的"N 步"其实是"N 个前置单元"而不是"N 次点击"——这是原项目文案含义不清的根因。
   */
  remainingUnits: number
  /**
   * **口径 B · 叶子数**：作用域（前置闭包 unit ∪ 目标 unit）内还未点亮的叶子总数。
   * UI 的「还需要 N 个知识点」用它——这才是用户真正要点的次数（保守估计：
   * 前提是每个前置 unit 的叶子都得点亮，门控语义确实如此）。
   */
  remainingLeaves: number
  /** 当前这一轮可执行的步骤（拓扑序；长度受 maxSteps 截断） */
  steps: TraceStep[]
  /** steps 是否因 maxSteps 被截断（true 表示还有后续步骤没显示） */
  truncated: boolean
  /** 目标 unit 现在是否已解锁（hard 前置齐了） */
  canLightTargetNow: boolean
  /** 阻塞原因（可多条；异常数据只记 blocker，不抛异常） */
  blockers: TraceBlocker[]
  /** 相对上一次 plan 是否有推进：仍有可执行动作、且没陷入环。UI 据此决定是否继续循环 */
  progressed: boolean
  /** 目标标题（一句话说明用；目标不存在时为空串） */
  targetTitle: string
  /** 未点亮的 hard 前置 unit id（拓扑序，最深在前） */
  closureUnitIds: string[]
  /** 作用域内已点亮叶子数（进度反馈「已点亮 k / 还需 N」的 k） */
  litLeavesInScope: number
  /** 作用域内叶子总数（= totalNeeded） */
  totalLeavesInScope: number
}

export interface PlanOptions {
  /** 单轮 steps 上限，默认 20 */
  maxSteps?: number
  /** 默认 false：soft 不参与门控也不新增义务；true 时仅作排序参考 */
  includeSoftPrereq?: boolean
}

const DEFAULT_MAX_STEPS = 20
/** parent / 依赖链遍历上限（与 core/graph.leafAvailable 的 64 同量级） */
const CHAIN_GUARD = 64

function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 叶子所属 unit：沿 parent 链上溯到**最近的 unit 祖先**（与 leafAvailable 的门控口径同源）。
 *  detailPanel.owningUnit 只取 node.parent，在章分组（unit → branch → leaf）下会取到 branch，
 *  故此处自行实现，不 import 它。 */
export function owningUnitOf(
  leaf: PackNode,
  index: GraphIndex,
  onMissing?: (id: string) => void
): string | null {
  let cur: string | null = leaf.parent
  const seen = new Set<string>([leaf.id])
  let guard = 0
  while (cur !== null && guard++ < CHAIN_GUARD) {
    if (seen.has(cur)) return null // parent 链成环（异常数据）
    seen.add(cur)
    const node = index.nodeById.get(cur)
    if (node === undefined) {
      onMissing?.(cur)
      return null
    }
    if (node.kind === 'unit') return node.id
    cur = node.parent
  }
  return null
}

/** root → 节点的 id 链与中文标题链；遇到缺失 parent 记 onMissing 并停止上溯 */
function breadcrumb(
  index: GraphIndex,
  id: string,
  onMissing?: (id: string) => void
): { path: string[]; pathLabels: string[] } {
  const path: string[] = []
  const pathLabels: string[] = []
  let cur: string | null = id
  const seen = new Set<string>()
  let guard = 0
  while (cur !== null && guard++ < CHAIN_GUARD) {
    if (seen.has(cur)) break
    seen.add(cur)
    const node = index.nodeById.get(cur)
    if (node === undefined) {
      onMissing?.(cur)
      break
    }
    path.unshift(node.id)
    pathLabels.unshift(node.title.zh)
    cur = node.parent
  }
  path.unshift('root')
  pathLabels.unshift(index.pack.title.zh)
  return { path, pathLabels }
}

function titleOf(index: GraphIndex, id: string): string {
  return index.nodeById.get(id)?.title.zh ?? id
}

/** 直接扫 pack.edges 取 hard 前置（对异常端点安全：不存在的端点单独回报，不像 core 那样 index!） */
function safeHardPrereqIds(unitId: string, index: GraphIndex): string[] {
  const ids: string[] = []
  for (const e of index.pack.edges) {
    if (e.type !== 'hard' || e.to !== unitId) continue
    if (index.nodeById.has(e.from)) ids.push(e.from)
  }
  return ids
}

/** core 的 isLit/unitAvailable 记忆化（同一次 plan 内 litLeaves 不变 → 结果不变；
 *  只是缓存纯函数返回值，没有重定义语义） */
function mkGateMemo(index: GraphIndex, litLeaves: Set<string>) {
  const litMemo = new Map<string, boolean>()
  const availMemo = new Map<string, boolean>()
  const containerLit = (id: string): boolean => {
    const hit = litMemo.get(id)
    if (hit !== undefined) return hit
    const v = isLit(id, index, litLeaves)
    litMemo.set(id, v)
    return v
  }
  const unlocked = (unitId: string): boolean => {
    const hit = availMemo.get(unitId)
    if (hit !== undefined) return hit
    let v: boolean
    try {
      v = unitAvailable(unitId, index, litLeaves)
    } catch {
      v = false // 异常数据（边端点缺失）：视为未解锁，由 blocker 回报
    }
    availMemo.set(unitId, v)
    return v
  }
  return { containerLit, unlocked }
}

/** 未点亮的传递 hard 前置闭包（不含目标自身）。
 *  单目标直接取 core 的 `minimalHardClosure`（口径与门控实现同源）；
 *  多目标（branch 展开）按同一 BFS 规则合并。 */
function collectObligations(
  targetUnits: string[],
  index: GraphIndex,
  litLeaves: Set<string>,
  memo: ReturnType<typeof mkGateMemo>,
  blockers: TraceBlocker[],
  onMissing: (id: string) => void
): string[] {
  const raw: string[] = []
  if (targetUnits.length === 1) {
    const only = targetUnits[0]!
    try {
      raw.push(...minimalHardClosure(only, index, litLeaves))
    } catch (err) {
      onMissing(`closure:${only}`)
      blockers.push({
        kind: 'cycle-suspected',
        ids: [only]
      })
      void err
    }
  }
  if (raw.length === 0) {
    // BFS：seen 集合保证即使 hard 边成环也不会挂住
    const seen = new Set<string>(targetUnits)
    let layer = targetUnits.flatMap((t) => safeHardPrereqIds(t, index))
    let guard = 0
    const cap = index.pack.nodes.length + 2
    while (layer.length > 0 && guard++ < cap) {
      const next: string[] = []
      for (const id of layer) {
        if (seen.has(id)) continue
        seen.add(id)
        const node = index.nodeById.get(id)
        if (node === undefined) {
          onMissing(id)
          continue
        }
        if (!memo.containerLit(id)) raw.push(id)
        next.push(...safeHardPrereqIds(id, index))
      }
      layer = next
    }
    if (guard >= cap) blockers.push({ kind: 'cycle-suspected', ids: [...seen].sort(cmpId) })
  }
  const targetSet = new Set(targetUnits)
  const uniq: string[] = []
  const inSet = new Set<string>()
  for (const id of raw) {
    if (targetSet.has(id) || inSet.has(id)) continue
    inSet.add(id)
    uniq.push(id)
  }
  return uniq
}

/** 拓扑定序：rank(u) = u 到目标之间最长前置链长度（目标 0，前置越深 rank 越大）。
 *  注意：必须沿"被依赖"方向（dep：from → 依赖它的 unit）DFS 才能走到目标，
 *  沿 prereq（依赖链向下）走算出的是"到叶子端的深度"，方向恰好相反。
 *  输出 rank 降序（最深的先），同 rank 按 id 升序 → 幂等、可测。
 *  发现环：记 cycle-suspected 并把环上项丢弃（不参与 steps）。 */
function orderDeepestFirst(
  obligations: string[],
  targetUnits: string[],
  index: GraphIndex,
  blockers: TraceBlocker[]
): { id: string; r: number }[] {
  if (obligations.length === 0) return []
  const nodes = new Set<string>([...obligations, ...targetUnits])
  const dep = new Map<string, string[]>() // from → 依赖它的 unit（沿此方向可达目标）
  for (const id of nodes) dep.set(id, [])
  for (const e of index.pack.edges) {
    if (e.type !== 'hard') continue
    if (!nodes.has(e.from) || !nodes.has(e.to)) continue
    dep.get(e.from)!.push(e.to)
  }
  const targetSet = new Set(targetUnits)
  const rank = new Map<string, number>()
  const state = new Map<string, 'visiting' | 'done'>()
  const cyclic = new Set<string>()

  const calc = (id: string, stack: string[]): number => {
    const cached = rank.get(id)
    if (cached !== undefined) return cached
    if (targetSet.has(id)) {
      rank.set(id, 0)
      return 0
    }
    if (stack.includes(id)) {
      // 自环依赖：整条链上的 unit 记为成环
      for (const c of stack.slice(stack.indexOf(id))) cyclic.add(c)
      return 0
    }
    if (state.get(id) === 'done') return rank.get(id) ?? 0
    state.set(id, 'visiting')
    stack.push(id)
    let best = 0
    for (const d of dep.get(id) ?? []) {
      const dr = calc(d, stack)
      best = Math.max(best, dr + 1)
    }
    stack.pop()
    state.set(id, 'done')
    rank.set(id, best)
    return best
  }

  const ordered: { id: string; r: number }[] = []
  for (const id of obligations) ordered.push({ id, r: calc(id, []) })
  if (cyclic.size > 0) blockers.push({ kind: 'cycle-suspected', ids: [...cyclic].sort(cmpId) })
  return ordered
    .filter((x) => !cyclic.has(x.id))
    .sort((a, b) => b.r - a.r || cmpId(a.id, b.id))
}

/** soft 前置闭包（**仅作排序偏置**，绝不参与门控、绝不新增点亮义务） */
function softBias(targetUnits: string[], index: GraphIndex): Set<string> {
  const out = new Set<string>()
  const seen = new Set<string>(targetUnits)
  let layer: string[] = []
  const push = (id: string): void => {
    if (!seen.has(id)) layer.push(id)
  }
  for (const t of targetUnits) {
    for (const e of index.pack.edges) if (e.type === 'soft' && e.to === t) push(e.from)
  }
  let guard = 0
  while (layer.length > 0 && guard++ < index.pack.nodes.length + 2) {
    const next: string[] = []
    for (const id of layer) {
      if (seen.has(id)) continue
      seen.add(id)
      const node = index.nodeById.get(id)
      if (node === undefined) continue
      if (node.kind === 'unit') out.add(id)
      for (const e of index.pack.edges) if (e.type === 'soft' && e.to === id) next.push(e.from)
    }
    layer = next
  }
  return out
}

/** unit 当前可点亮的叶子：未亮 + `leafAvailable` 为真，按 id 稳定排序 */
function emittableLeaves(
  unitId: string,
  index: GraphIndex,
  litLeaves: Set<string>
): { leaves: PackNode[]; lit: number; total: number; gated: number } {
  const all = [...index.leavesOf(unitId)].sort((a, b) => cmpId(a.id, b.id))
  const leaves: PackNode[] = []
  let lit = 0
  let gated = 0
  for (const l of all) {
    if (litLeaves.has(l.id)) {
      lit++
      continue
    }
    // 准入的唯一判据：core 的 leafAvailable（未解锁 unit 的叶子在这里就被挡掉）
    if (leafAvailable(l.id, index, litLeaves)) leaves.push(l)
    else gated++
  }
  return { leaves, lit, total: all.length, gated }
}

function emptyPlan(targetId: string, blockers: TraceBlocker[]): LightChainPlan {
  return {
    targetId,
    targetKind: 'unit',
    litCount: 0,
    totalNeeded: 0,
    remainingSteps: 0,
    remainingUnits: 0,
    remainingLeaves: 0,
    steps: [],
    truncated: false,
    canLightTargetNow: false,
    blockers,
    progressed: false,
    targetTitle: '',
    closureUnitIds: [],
    litLeavesInScope: 0,
    totalLeavesInScope: 0
  }
}

/**
 * 计算"把 targetId 推到点亮"的点亮顺序。纯函数，不修改入参。
 *
 * steps 的不变式（单测逐条盯）：
 * - 每项 `leafAvailable(leafId, index, litLeaves)` 必为真；
 * - 顺序为 hard 前置的拓扑序（最深的 unit 在前），同一 unit 内叶子按 id 升序；
 * - 未解锁 unit 的叶子一定不出现（哪怕它在闭包里）。
 */
export function planLightChain(
  targetId: string,
  index: GraphIndex,
  litLeaves: Set<string>,
  opts?: PlanOptions
): LightChainPlan {
  const maxSteps = opts?.maxSteps ?? DEFAULT_MAX_STEPS
  const includeSoftPrereq = opts?.includeSoftPrereq ?? false
  const blockers: TraceBlocker[] = []
  const missingSeen = new Set<string>()
  const onMissing = (id: string): void => {
    if (missingSeen.has(id)) return
    missingSeen.add(id)
    blockers.push({ kind: 'missing-pack-node', id })
  }

  const target = index.nodeById.get(targetId)
  if (target === undefined) {
    onMissing(targetId)
    return emptyPlan(targetId, blockers)
  }

  // 目标归一：leaf → 所属 unit；unit → 自身；branch → 其 unit 后代
  let targetKind: 'unit' | 'leaf'
  let targetUnits: string[]
  if (target.kind === 'unit') {
    targetKind = 'unit'
    targetUnits = [target.id]
  } else if (target.kind === 'leaf') {
    targetKind = 'leaf'
    const u = owningUnitOf(target, index, onMissing)
    targetUnits = u === null ? [] : [u]
  } else {
    targetKind = 'unit'
    targetUnits = index.unitsOf(target.id).map((n) => n.id).sort(cmpId)
  }
  if (targetUnits.length === 0) return emptyPlan(targetId, blockers)

  const memo = mkGateMemo(index, litLeaves)
  const rawObligations = collectObligations(targetUnits, index, litLeaves, memo, blockers, onMissing)

  // 排序：拓扑"最深在前"（rank 降序）；开启 soft 时 soft 闭包内的 unit 仅在同 rank 内提前
  // （仅排序参考，不新增义务、不影响 steps）
  const soft = includeSoftPrereq ? softBias(targetUnits, index) : null
  const obligations = orderDeepestFirst(rawObligations, targetUnits, index, blockers)
    .sort((a, b) => {
      if (b.r !== a.r) return b.r - a.r
      if (soft === null) return cmpId(a.id, b.id)
      const sa = soft.has(a.id) ? 0 : 1
      const sb = soft.has(b.id) ? 0 : 1
      return sa - sb || cmpId(a.id, b.id)
    })
    .map((x) => x.id)

  // 作用域 = 目标 unit ∪ 闭包 unit
  const scopeUnits = new Set<string>([...targetUnits, ...obligations])
  const scopeLeaves = new Set<string>()
  for (const u of scopeUnits) for (const l of index.leavesOf(u)) scopeLeaves.add(l.id)
  let litInScope = 0
  for (const id of scopeLeaves) if (litLeaves.has(id)) litInScope++
  const totalNeeded = scopeLeaves.size
  const remainingLeaves = totalNeeded - litInScope

  let targetOwnLit = 0
  for (const t of targetUnits) for (const l of index.leavesOf(t)) if (litLeaves.has(l.id)) targetOwnLit++

  let canLightTargetNow = true
  for (const t of targetUnits) if (!memo.unlocked(t)) canLightTargetNow = false

  if (targetUnits.every((t) => memo.containerLit(t)))
    blockers.push({ kind: 'already-lit', unitId: targetUnits[0]! })

  // 发射：只信 litLeaves（不假设前面步骤已生效）→ 一轮里发射"当前已解锁"的闭包 unit。
  // 剩余 unit 留待下一次 plan（点亮后重新调用）。迭代上界 = unit 数 × 2，超限记 blocker。
  const steps: TraceStep[] = []
  let truncated = false
  const unitCount = index.pack.nodes.reduce((n, x) => (x.kind === 'unit' ? n + 1 : n), 0)
  const iterCap = Math.max(1, unitCount) * 2
  const pending = new Set(obligations)
  const emittedUnits = new Set<string>()
  let iterations = 0

  while (pending.size > 0) {
    if (++iterations > iterCap) {
      blockers.push({ kind: 'cycle-suspected', ids: [...pending].sort(cmpId) })
      break
    }
    let didEmit = false
    for (const unitId of obligations) {
      if (!pending.has(unitId)) continue
      if (steps.length >= maxSteps) {
        truncated = true
        break
      }
      if (!memo.unlocked(unitId)) continue // 未解锁 unit：其叶子一律不发
      pending.delete(unitId)
      emittedUnits.add(unitId)
      didEmit = true
      const { leaves, lit, total, gated } = emittableLeaves(unitId, index, litLeaves)
      if (leaves.length === 0) {
        blockers.push({
          kind: 'no-available-leaf',
          unitId,
          reason:
            total === 0
              ? `「${titleOf(index, unitId)}」是没有任何知识点的空容器，点不亮它、也无法靠它推进`
              : gated > 0
                ? `「${titleOf(index, unitId)}」已解锁，但 ${gated} 个叶子的 parent 链异常（被更深的门控挡住），共 ${total} 个叶子 / 已点亮 ${lit}`
                : `「${titleOf(index, unitId)}」的 ${total} 个知识点已全部点亮`
        })
        continue
      }
      for (const l of leaves) {
        if (steps.length >= maxSteps) {
          truncated = true
          break
        }
        if (!leafAvailable(l.id, index, litLeaves)) continue // 出栈前最后防线（防未来改动破坏不变式）
        const { path, pathLabels } = breadcrumb(index, l.id, onMissing)
        steps.push({ unitId, leafId: l.id, order: steps.length + 1, path, pathLabels })
      }
    }
    if (truncated) break
    if (!didEmit) {
      // 一整轮没推进：若剩余 unit 彼此互为前置且都未解锁 → 环兜底；
      // 否则它们的未点亮前置不在闭包内（空容器/数据异常）→ 逐个出 no-available-leaf blocker。
      const stuckIds: string[] = []
      for (const unitId of [...pending]) {
        const unmet = safeHardPrereqIds(unitId, index).filter((p) => !memo.containerLit(p))
        const inPending = unmet.some((p) => pending.has(p))
        if (inPending) {
          stuckIds.push(unitId)
          continue
        }
        for (const p of unmet) {
          if (!emittedUnits.has(p)) {
            blockers.push({
              kind: 'no-available-leaf',
              unitId,
              reason: `「${titleOf(index, unitId)}」的前置「${titleOf(
                index,
                p
              )}」不在点亮计划内且未点亮（空容器或数据异常），无法解锁`
            })
          }
        }
        pending.delete(unitId)
      }
      if (stuckIds.length > 0) blockers.push({ kind: 'cycle-suspected', ids: stuckIds.sort(cmpId) })
      break
    }
  }

  const cycle = blockers.some((b) => b.kind === 'cycle-suspected')
  const progressed = !cycle && (steps.length > 0 || canLightTargetNow || truncated)

  return {
    targetId,
    targetKind,
    litCount: targetOwnLit,
    totalNeeded,
    remainingSteps: remainingLeaves,
    remainingUnits: obligations.length,
    remainingLeaves,
    steps,
    truncated,
    canLightTargetNow,
    blockers,
    progressed,
    targetTitle: target.title.zh,
    closureUnitIds: obligations,
    litLeavesInScope: litInScope,
    totalLeavesInScope: totalNeeded
  }
}

/** 严格推进判定（叶子级）：供 lead / e2e 需要"确实更近了"时使用（plan.progressed 只看是否还有动作） */
export function planAdvanced(prev: LightChainPlan, next: LightChainPlan): boolean {
  return next.litLeavesInScope > prev.litLeavesInScope
}

/* ------------------------------------------------------------------ */
/* 3.2 UI 层                                                           */
/* ------------------------------------------------------------------ */

export interface PathTraceDeps {
  index: GraphIndex
  /** 每次刷新时重新取（不要在外面缓存 Set） */
  litLeavesProvider: () => Set<string>
  /** 由 lead 接到 store.lightLeaf + 点亮仪式 */
  onLightLeaf(leafId: string): void
  /** 跳转到某一步所属视图 */
  onJump(nodeId: string): void
  /** 仅用于记住"面板收起"这类 UI 偏好；绝不写 progress */
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void }
}

export interface PathTraceHandle {
  open(targetId: string): void
  close(): void
  refresh(): void
  destroy(): void
  readonly el: HTMLElement
}

const STORAGE_KEY = 'litree:path-trace:collapsed'
/** 单轮渲染的步骤上限（"全部点亮"会自动续下一轮） */
const UI_MAX_STEPS_PER_ROUND = 12
/** 连续点亮的安全上界 */
const LIGHT_ALL_CAP = 40000

interface DocLike {
  createElement(tag: string): HTMLElement
}

/** 从 mount 反推 document：优先 ownerDocument，退回 globalThis.document
 *  （这样组件在真浏览器、happy-dom、jsdom 下都能跑，也不依赖 import 时的全局） */
function ownerDocOf(node: HTMLElement): DocLike {
  const own = (node as Element & { ownerDocument?: DocLike }).ownerDocument
  if (own !== undefined && own !== null) return own
  const g = globalThis as unknown as { document?: DocLike }
  if (g.document !== undefined && g.document !== null) return g.document
  throw new Error('PathTrace 需要 DOM：mount.ownerDocument 与 globalThis.document 均不可用')
}

function mk(doc: DocLike, tag: string, className?: string, id?: string): HTMLElement {
  const el = doc.createElement(tag)
  if (className !== undefined) el.className = className
  if (id !== undefined) el.setAttribute('id', id)
  return el
}

function txt(doc: DocLike, tag: string, text: string, className?: string): HTMLElement {
  const el = mk(doc, tag, className)
  el.textContent = text
  return el
}

function btn(doc: DocLike, id: string, label: string, className: string, ariaLabel: string): HTMLElement {
  const el = mk(doc, 'button', className, id)
  el.setAttribute('type', 'button')
  el.setAttribute('aria-label', ariaLabel)
  el.textContent = label
  return el
}

function clearChildren(el: HTMLElement): void {
  let c = el.firstChild
  while (c !== null && c !== undefined) {
    el.removeChild(c)
    c = el.firstChild
  }
}

/** 创建点亮路径面板：只在自身 el 子树内操作 DOM；不读 progress、不写 storage（除收起偏好）。 */
export function createPathTrace(mount: HTMLElement, deps: PathTraceDeps): PathTraceHandle {
  const doc = ownerDocOf(mount)
  const el = mk(doc, 'div', 'trace-panel trace-panel--hidden', 'path-trace')
  el.setAttribute('role', 'region')
  el.setAttribute('aria-label', '点亮路径')
  el.setAttribute('tabindex', '-1')

  let targetId: string | null = null
  let collapsed = deps.storage?.getItem(STORAGE_KEY) === '1'
  /** 本面板会话内点亮过的叶子（视图局部状态，仅用于"已完成打勾"） */
  const doneLeaves = new Set<string>()
  let stopReason = ''

  const head = mk(doc, 'div', 'trace-head')
  const titleEl = txt(doc, 'div', '', 'trace-title')
  titleEl.setAttribute('id', 'trace-title')
  const progressEl = txt(doc, 'div', '', 'trace-progress')
  progressEl.setAttribute('id', 'trace-progress')
  progressEl.setAttribute('aria-live', 'polite')
  const collapseBtn = btn(doc, 'trace-collapse', '收起', 'trace-mini', '收起点亮路径面板')
  const closeBtn = btn(doc, 'trace-close', '关闭', 'trace-mini', '关闭点亮路径面板')
  head.appendChild(titleEl)
  head.appendChild(progressEl)
  head.appendChild(collapseBtn)
  head.appendChild(closeBtn)
  const body = mk(doc, 'div', 'trace-body')
  el.appendChild(head)
  el.appendChild(body)
  mount.appendChild(el)

  function nodeOf(id: string): PackNode | undefined {
    return deps.index.nodeById.get(id)
  }

  function leafTitle(id: string): string {
    return nodeOf(id)?.title.zh ?? id
  }

  function planNow(maxSteps = UI_MAX_STEPS_PER_ROUND): LightChainPlan | null {
    if (targetId === null) return null
    return planLightChain(targetId, deps.index, deps.litLeavesProvider(), { maxSteps })
  }

  /** 目标 unit 自身当前可点亮的叶子（前置齐了但目标还没点亮时，"点亮它"就是点这些） */
  function targetOwnAvailable(): string[] {
    if (targetId === null) return []
    const lit = deps.litLeavesProvider()
    const node = nodeOf(targetId)
    if (node === undefined) return []
    const units: string[] =
      node.kind === 'unit'
        ? [node.id]
        : node.kind === 'leaf'
          ? ((owningUnitOf(node, deps.index) ?? null) === null ? [] : [owningUnitOf(node, deps.index)!])
          : deps.index.unitsOf(node.id).map((n) => n.id)
    const out: string[] = []
    for (const u of units) {
      for (const l of [...deps.index.leavesOf(u)].sort((a, b) => cmpId(a.id, b.id))) {
        if (lit.has(l.id)) continue
        if (leafAvailable(l.id, deps.index, lit)) out.push(l.id)
      }
    }
    return out
  }

  /**
   * 取下一步该点的叶子——每次调用都重新读 litLeaves 并**重新校验 leafAvailable**，
   * 绝不复用上一轮渲染出来的 steps（盲连点会破门控）。
   */
  function pickNextLeafId(): { leafId: string | null; reason: string } {
    if (targetId === null) return { leafId: null, reason: '未选择目标' }
    const lit = deps.litLeavesProvider()
    const plan = planLightChain(targetId, deps.index, lit, { maxSteps: 1 })
    const step = plan.steps[0]
    if (step !== undefined) {
      if (!leafAvailable(step.leafId, deps.index, lit)) {
        return { leafId: null, reason: `门控未通过：「${leafTitle(step.leafId)}」的前置还没点齐，已停止连续点亮` }
      }
      return { leafId: step.leafId, reason: '' }
    }
    if (plan.canLightTargetNow) {
      for (const id of targetOwnAvailable()) {
        if (leafAvailable(id, deps.index, lit)) return { leafId: id, reason: '' }
      }
      return { leafId: null, reason: '目标已完全点亮' }
    }
    const b = plan.blockers[0]
    if (b === undefined) return { leafId: null, reason: '当前没有可执行的步骤' }
    switch (b.kind) {
      case 'no-available-leaf':
        return { leafId: null, reason: b.reason }
      case 'cycle-suspected':
        return { leafId: null, reason: `前置依赖成环：${b.ids.join(' → ')}` }
      case 'missing-pack-node':
        return { leafId: null, reason: `数据包缺少节点：${b.id}` }
      case 'already-lit':
        return { leafId: null, reason: '目标已完全点亮' }
    }
  }

  /** 点亮一步：重算 plan → 校验门控 → 调 onLightLeaf → refresh */
  function lightOne(): boolean {
    const pick = pickNextLeafId()
    if (pick.leafId === null) {
      stopReason = pick.reason
      return false
    }
    const leafId = pick.leafId
    const before = deps.litLeavesProvider()
    if (!leafAvailable(leafId, deps.index, before)) {
      stopReason = `门控未通过：「${leafTitle(leafId)}」的前置还没点齐，已停止连续点亮`
      return false
    }
    try {
      deps.onLightLeaf(leafId)
    } catch (err) {
      stopReason = `点亮失败：${err instanceof Error ? err.message : String(err)}`
      return false
    }
    doneLeaves.add(leafId)
    stopReason = ''
    refresh()
    return true
  }

  /** 按顺序全部点亮：每点一次都重新 plan + 重新校验；不满足立即停止并把原因画在界面上 */
  function lightAll(): void {
    stopReason = ''
    let n = 0
    while (n++ < LIGHT_ALL_CAP) {
      if (!lightOne()) break
    }
    if (n > LIGHT_ALL_CAP) stopReason = '已达迭代上限，停止连续点亮（防死循环）'
    refresh()
  }

  function headerLine(plan: LightChainPlan): string {
    if (plan.remainingLeaves === 0 && plan.canLightTargetNow) return `「${plan.targetTitle}」已全部点亮`
    if (plan.remainingUnits === 0)
      return `把「${plan.targetTitle}」点亮还需要 ${plan.remainingLeaves} 个知识点（前置已齐）`
    return `把「${plan.targetTitle}」点亮还需要 ${plan.remainingLeaves} 个知识点，涉及 ${plan.remainingUnits} 个单元`
  }

  function applyState(): void {
    if (targetId === null) {
      el.className = 'trace-panel trace-panel--hidden'
      el.setAttribute('aria-hidden', 'true')
      return
    }
    el.className = collapsed ? 'trace-panel trace-panel--collapsed' : 'trace-panel'
    el.setAttribute('aria-hidden', 'false')
    body.className = collapsed ? 'trace-body trace-body--hidden' : 'trace-body'
    collapseBtn.textContent = collapsed ? '展开' : '收起'
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  }

  function render(): void {
    applyState()
    clearChildren(body)
    const plan = planNow()
    if (plan === null || collapsed) {
      if (plan !== null) progressEl.textContent = headerLine(plan)
      return
    }
    titleEl.textContent = plan.targetKind === 'leaf' ? `点亮路径 · ${plan.targetTitle}` : `点亮路径 · ${plan.targetTitle}`
    progressEl.textContent = `已点亮 ${plan.litLeavesInScope} / 还需 ${plan.remainingLeaves}`

    const actions = mk(doc, 'div', 'trace-actions')
    const allBtn = btn(
      doc,
      'trace-light-all',
      plan.canLightTargetNow ? '按顺序点亮到底' : '按顺序全部点亮',
      'trace-btn trace-btn--primary',
      '按顺序全部点亮'
    )
    allBtn.addEventListener('click', () => lightAll())
    const oneBtn = btn(doc, 'trace-light-one', '只点亮当前一步', 'trace-btn', '只点亮当前一步')
    oneBtn.addEventListener('click', () => lightOne())
    actions.appendChild(allBtn)
    actions.appendChild(oneBtn)
    body.appendChild(actions)

    if (plan.canLightTargetNow && plan.steps.length === 0) {
      const ready = mk(doc, 'div', 'trace-ready')
      ready.appendChild(
        txt(doc, 'div', plan.remainingLeaves === 0 ? '目标已点亮' : '目标已可点亮，去点亮它', 'trace-ready-msg')
      )
      if (plan.remainingLeaves > 0) {
        const go = btn(
          doc,
          'trace-light-target',
          plan.targetKind === 'leaf' ? '点亮目标' : `点亮目标剩余 ${plan.remainingLeaves} 个知识点`,
          'trace-btn trace-btn--primary',
          '点亮目标知识点'
        )
        go.addEventListener('click', () => lightAll())
        ready.appendChild(go)
      }
      body.appendChild(ready)
    }

    if (plan.steps.length > 0) {
      const list = mk(doc, 'div', 'trace-list')
      list.setAttribute('role', 'list')
      for (const step of plan.steps) {
        const label = leafTitle(step.leafId)
        const done = doneLeaves.has(step.leafId)
        const row = mk(doc, 'div', done ? 'trace-step trace-step--done' : 'trace-step')
        row.setAttribute('role', 'listitem')
        row.setAttribute('aria-label', `第 ${step.order} 步：${done ? '已点亮' : '点亮'} ${label}`)
        row.appendChild(txt(doc, 'span', done ? '✓' : `${step.order}`, 'trace-step-order'))
        const info = mk(doc, 'div', 'trace-step-info')
        info.appendChild(txt(doc, 'div', label, 'trace-step-leaf'))
        info.appendChild(
          txt(doc, 'div', step.pathLabels.slice(1, -1).join(' › ') || deps.index.pack.title.zh, 'trace-step-path')
        )
        row.appendChild(info)
        const btns = mk(doc, 'div', 'trace-step-btns')
        const lightBtn = btn(doc, '', done ? '已点亮' : '点亮', 'trace-step-light', `点亮 ${label}`)
        lightBtn.setAttribute('data-leaf', step.leafId)
        if (done) lightBtn.setAttribute('disabled', 'disabled')
        lightBtn.addEventListener('click', () => {
          // 单步也走"重新校验"：不信渲染时的旧 plan
          const lit = deps.litLeavesProvider()
          if (!leafAvailable(step.leafId, deps.index, lit)) {
            stopReason = `门控未通过：「${label}」的前置还没点齐`
            refresh()
            return
          }
          try {
            deps.onLightLeaf(step.leafId)
            doneLeaves.add(step.leafId)
            stopReason = ''
          } catch (err) {
            stopReason = `点亮失败：${err instanceof Error ? err.message : String(err)}`
          }
          refresh()
        })
        const jumpBtn = btn(doc, '', '去看', 'trace-step-jump', `去看 ${label}`)
        jumpBtn.addEventListener('click', () => deps.onJump(step.leafId))
        btns.appendChild(lightBtn)
        btns.appendChild(jumpBtn)
        row.appendChild(btns)
        list.appendChild(row)
      }
      body.appendChild(list)
      if (plan.truncated)
        body.appendChild(
          txt(doc, 'div', '本轮只显示前若干步；"按顺序全部点亮"会自动继续后面的步骤。', 'trace-more')
        )
    }

    if (doneLeaves.size > 0) {
      const doneBox = mk(doc, 'div', 'trace-done')
      doneBox.appendChild(txt(doc, 'div', `✓ 本面板已点亮 ${doneLeaves.size} 步`, 'trace-done-cap'))
      body.appendChild(doneBox)
    }

    for (const b of plan.blockers) {
      if (b.kind === 'already-lit') continue
      const text =
        b.kind === 'no-available-leaf'
          ? `⚠ ${b.reason}`
          : b.kind === 'cycle-suspected'
            ? `⚠ 前置依赖成环：${b.ids.join(' → ')}`
            : `⚠ 数据包缺少节点：${b.id}`
      body.appendChild(txt(doc, 'div', text, 'trace-blocker'))
    }

    if (stopReason !== '') {
      const stop = txt(doc, 'div', stopReason, 'trace-stopped')
      stop.setAttribute('role', 'status')
      body.appendChild(stop)
    }

    if (plan.steps.length === 0 && !plan.canLightTargetNow)
      body.appendChild(txt(doc, 'div', '当前没有可执行步骤：先点亮更深的前置，或刷新看进展。', 'trace-empty'))
  }

  function refresh(): void {
    render()
  }

  collapseBtn.addEventListener('click', () => {
    collapsed = !collapsed
    deps.storage?.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    render()
  })
  closeBtn.addEventListener('click', () => {
    targetId = null
    render()
  })

  const handle: PathTraceHandle = {
    open(id: string): void {
      targetId = id
      stopReason = ''
      doneLeaves.clear()
      render()
      try {
        el.focus?.()
      } catch {
        /* fake DOM 没有 focus：忽略 */
      }
    },
    close(): void {
      targetId = null
      render()
    },
    refresh,
    destroy(): void {
      const p = el.parentNode
      if (p !== null && p !== undefined) p.removeChild(el)
      else el.remove?.()
    },
    get el(): HTMLElement {
      return el
    }
  }
  return handle
}
