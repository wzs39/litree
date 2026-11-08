/** elkjs 封装：renderer 环境 Worker 化（elk 协议），Node/测试环境直调主入口（spec §5.1） */
// @ts-expect-error elkjs api 无类型声明
import ELKApi from 'elkjs/lib/elk-api.js'
import type { GraphIndex } from '../core/graph'
import type { Pack } from '../core/types'

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
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'
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
  const mod = (await import('./elk.worker?worker')) as unknown as {
    default: new () => Worker
  }
  const elk = new ELKApi({
    workerFactory: () => new mod.default()
  }) as ElkLike
  return elk.layout(graph).then((r) => toMap(r.children ?? []))
}
