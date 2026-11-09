/** elkjs 封装：renderer 环境 Worker 化（elk 协议），Node/测试环境直调主入口（spec §5.1） */
import ELKApi from 'elkjs/lib/elk-api.js'
import type { GraphIndex } from '../core/graph'
import type { Pack, PackNode } from '../core/types'

export interface LaidOutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

/** 节点卡片尺寸（spec §9 视觉：分支 > 单元 > 叶子） */
export const NODE_SIZE: Record<string, { w: number; h: number }> = {
  branch: { w: 220, h: 64 },
  unit: { w: 176, h: 58 },
  leaf: { w: 150, h: 40 }
}

export const ROOT_VIEW = 'root'

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.nodeNodeBetweenLayers': '56',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.edgeRouting': 'NETWORK_SIMPLEX'
}

interface ElkGraph {
  id: string
  layoutOptions: Record<string, string>
  children: { id: string; width: number; height: number }[]
  edges: { id: string; sources: string[]; targets: string[] }[]
}

interface ElkResultChild {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
}

interface ElkLike {
  layout(graph: ElkGraph): Promise<{ children?: ElkResultChild[] }>
}

function buildGraph(pack: Pack, index: GraphIndex, containerId: string): ElkGraph {
  const children =
    containerId === ROOT_VIEW
      ? pack.nodes.filter((n) => n.parent === null)
      : index.childrenOf(containerId)
  const childIds = new Set(children.map((c) => c.id))
  return {
    id: containerId,
    layoutOptions: LAYOUT_OPTIONS,
    children: children.map((c) => {
      const size = NODE_SIZE[c.kind] ?? NODE_SIZE['unit']!
      return { id: c.id, width: size.w, height: size.h }
    }),
    edges: pack.edges
      .filter((e) => childIds.has(e.from) && childIds.has(e.to))
      .map((e) => ({ id: `${e.from}->${e.to}`, sources: [e.from], targets: [e.to] }))
  }
}

function toMap(children: ElkResultChild[]): Map<string, LaidOutNode> {
  const out = new Map<string, LaidOutNode>()
  for (const c of children ?? []) {
    out.set(c.id, { id: c.id, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0 })
  }
  return out
}

/** 知识清单布局：章条为宽标题条、叶子芯片网格（每行 4 枚），章条总在其叶子之上 */
export function checklistLayout(index: GraphIndex, children: PackNode[]): Map<string, LaidOutNode> {
  const out = new Map<string, LaidOutNode>()
  const LEAF_W = NODE_SIZE['leaf']!.w
  const LEAF_H = NODE_SIZE['leaf']!.h
  const HEADER_W = 560
  const HEADER_H = 30
  const GAP = 12
  const ROW = 4
  let y = 0
  let x = 0
  let rowStartY = y
  let rowFill = 0
  const placeLeaf = (c: PackNode): void => {
    if (rowFill >= ROW) {
      y = rowStartY + LEAF_H + GAP
      rowStartY = y
      rowFill = 0
      x = 0
    }
    out.set(c.id, { id: c.id, x, y: rowStartY, width: LEAF_W, height: LEAF_H })
    x += LEAF_W + GAP
    rowFill++
  }
  for (const c of children) {
    if (c.kind === 'branch') {
      // 章条：收起当前行，另起
      y += rowFill > 0 ? LEAF_H + GAP * 2 : 0
      x = 0
      rowFill = 0
      out.set(c.id, { id: c.id, x: 0, y, width: HEADER_W, height: HEADER_H })
      y += HEADER_H + GAP
      rowStartY = y
      for (const leaf of index.childrenOf(c.id)) placeLeaf(leaf) // 章下叶子直接平铺
    } else {
      placeLeaf(c)
    }
  }
  return out
}

interface WorkerReply {
  id: number
  ok: boolean
  layout?: Record<string, { x: number; y: number; width: number; height: number }>
  error?: string
}

export async function layoutSubview(
  pack: Pack,
  index: GraphIndex,
  containerId: string
): Promise<Map<string, LaidOutNode>> {
  // unit 视图 = 知识清单（章条 + 叶子芯片网格），确定性手工布局；叶子无依赖边，elk 分层无意义
  const containerNode = index.nodeById.get(containerId)
  if (containerNode?.kind === 'unit') {
    return Promise.resolve(checklistLayout(index, index.childrenOf(containerId)))
  }
  const graph = buildGraph(pack, index, containerId)

  // Node/测试环境：elkjs 主入口经 worker_threads 自跑（@vite-ignore 阻止浏览器打包解析）
  if (typeof window === 'undefined') {
    const mod = (await import(/* @vite-ignore */ 'elkjs')) as unknown as {
      default: new () => ElkLike
    }
    const elk = new mod.default()
    return elk.layout(graph).then((r) => toMap(r.children ?? []))
  }

  // renderer 环境：Worker 化（elk 协议：api 在主线程、elk-worker.js 在 worker 内自注册）
  // 模块级惰性单例：每次 layoutSubview 复用同一个 ELKApi/Worker，避免 worker 泄漏与重复初始化
  const elk = await getBrowserElk()
  return elk.layout(graph).then((r) => toMap(r.children ?? []))
}

let browserElkPromise: Promise<ElkLike> | null = null

/** 浏览器侧 ELKApi 单例（失败后重置，允许重试） */
function getBrowserElk(): Promise<ElkLike> {
  if (browserElkPromise === null) {
    const p = (async () => {
      const mod = (await import('./elk.worker?worker')) as unknown as {
        default: new () => Worker
      }
      return new ELKApi({
        workerFactory: () => new mod.default()
      }) as ElkLike
    })()
    browserElkPromise = p
    p.catch(() => {
      if (browserElkPromise === p) browserElkPromise = null
    })
  }
  return browserElkPromise
}
