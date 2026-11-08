/** 路线首页纯逻辑（v2 spec §1）：继续学习定位 */
import { unitAvailable, type GraphIndex } from './graph'
import type { Pack, Progress } from './types'

export interface HomeTarget {
  unitId: string
  routeIndex: number
}

/** 「继续学习」目标：最近点亮知识点所属 unit；无历史时取第一条路线中首个可用单元 */
export function continueTarget(
  pack: Pack,
  index: GraphIndex,
  progress: Progress
): HomeTarget | null {
  const lit = new Set(Object.keys(progress.lit))

  const last = [...progress.history].sort((a, b) => b.at.localeCompare(a.at))[0]
  if (last !== undefined) {
    const node = index.nodeById.get(last.id)
    const unitId =
      node?.kind === 'leaf' ? node.parent : node?.kind === 'unit' ? node.id : node?.parent
    if (unitId !== undefined && unitId !== null && index.nodeById.get(unitId) !== undefined) {
      const routeIndex = pack.routes?.findIndex((r) => r.ids.includes(unitId)) ?? -1
      return { unitId, routeIndex: routeIndex >= 0 ? routeIndex : 0 }
    }
  }

  if (pack.routes !== undefined && pack.routes.length > 0) {
    let found: HomeTarget | null = null
    outer: for (let routeIndex = 0; routeIndex < pack.routes.length; routeIndex++) {
      for (const id of pack.routes[routeIndex]!.ids) {
        if (unitAvailable(id, index, lit)) {
          found = { unitId: id, routeIndex }
          break outer
        }
      }
    }
    if (found !== null) return found
    const first = pack.routes[0]?.ids[0]
    if (first !== undefined) return { unitId: first, routeIndex: 0 }
  }
  return null
}
