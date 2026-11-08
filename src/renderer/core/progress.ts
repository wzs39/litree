/** 进度纯逻辑（spec §4.2）：不可变更新；XP 规则知识点 +2 */
import type { GraphIndex } from './graph'
import type { Progress } from './types'

export const XP_PER_LEAF = 2

export function emptyProgress(packId: string): Progress {
  return { packId, lit: {}, learning: {}, xp: 0, history: [] }
}

export function lightLeaf(
  progress: Progress,
  leafId: string,
  index: GraphIndex,
  at: string
): Progress {
  if (progress.lit[leafId] !== undefined) return progress // 幂等
  if (!index.nodeById.has(leafId)) return progress
  return {
    ...progress,
    lit: { ...progress.lit, [leafId]: { at } },
    xp: progress.xp + XP_PER_LEAF,
    // 修剪上限 500（UI 只展示 8 条；防 localStorage 配额无限增长）
    history: (() => {
      const h = [...progress.history, { id: leafId, at, xp: XP_PER_LEAF }]
      return h.length > 500 ? h.slice(h.length - 500) : h
    })()
  }
}

export function toggleLearning(progress: Progress, id: string, date: string): Progress {
  const learning = { ...progress.learning }
  if (learning[id] !== undefined) delete learning[id]
  else learning[id] = date
  return { ...progress, learning }
}

/** pack 更新后残留的孤立点亮 id（Review Focus 1） */
export function orphanedLitIds(progress: Progress, index: GraphIndex): string[] {
  return Object.keys(progress.lit).filter((id) => !index.nodeById.has(id))
}
